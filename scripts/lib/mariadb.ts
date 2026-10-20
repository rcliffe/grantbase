import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import type { Readable, Writable } from "node:stream";

/**
 * Runs the MariaDB command-line tools against DATABASE_URL. Uses the tools on the
 * host when they are installed, otherwise runs them inside the docker compose `db`
 * container. The password is passed in the MYSQL_PWD environment variable, never as
 * a command-line argument, so it doesn't show up in process listings.
 */

export type Connection = { host: string; port: number; user: string; password: string; database: string };

export function connectionFromEnv(): Connection {
  const raw = process.env.DATABASE_URL;
  if (!raw) throw new Error("DATABASE_URL is not set. Copy .env.example to .env.");
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error("DATABASE_URL is not a valid URL.");
  }
  const database = decodeURIComponent(url.pathname.slice(1));
  if (!database) throw new Error("DATABASE_URL has no database name.");
  return {
    host: url.hostname,
    port: Number(url.port || 3306),
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database,
  };
}

function onPath(name: string): boolean {
  return (process.env.PATH ?? "").split(path.delimiter).some((dir) => {
    try {
      fs.accessSync(path.join(dir, name), fs.constants.X_OK);
      return true;
    } catch {
      return false;
    }
  });
}

type Tool = "dump" | "client";
const TOOL_NAMES: Record<Tool, string[]> = { dump: ["mariadb-dump", "mysqldump"], client: ["mariadb", "mysql"] };

export function describeRunner(tool: Tool): string {
  const local = TOOL_NAMES[tool].find(onPath);
  return local ? `${local} on this machine` : `${TOOL_NAMES[tool][0]} in the docker compose "db" container`;
}

function command(tool: Tool, conn: Connection, args: string[]): { cmd: string; args: string[] } {
  const local = TOOL_NAMES[tool].find(onPath);
  if (local) return { cmd: local, args: [`--host=${conn.host}`, `--port=${conn.port}`, `--user=${conn.user}`, ...args] };
  // Inside the container the server listens on its default port; `-e MYSQL_PWD` copies
  // the value from this process's environment.
  return {
    cmd: "docker",
    args: ["compose", "exec", "-T", "-e", "MYSQL_PWD", "db", TOOL_NAMES[tool][0], "--host=127.0.0.1", "--port=3306", `--user=${conn.user}`, ...args],
  };
}

/**
 * Runs a MariaDB tool, piping `stdin` in and stdout to `stdout`. Resolves when it exits
 * successfully; rejects with its error output otherwise.
 */
export function runTool(
  tool: Tool,
  conn: Connection,
  args: string[],
  io: { stdin?: Readable; stdout?: Writable } = {},
): Promise<string> {
  const { cmd, args: fullArgs } = command(tool, conn, args);
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, fullArgs, {
      env: { ...process.env, MYSQL_PWD: conn.password },
      stdio: "pipe",
    });
    let stdout = "";
    let stderr = "";
    if (io.stdout) child.stdout.pipe(io.stdout, { end: false });
    else child.stdout.on("data", (chunk: Buffer) => (stdout += chunk.toString("utf8")));
    child.stderr.on("data", (chunk: Buffer) => (stderr += chunk.toString("utf8")));
    if (io.stdin) {
      io.stdin.on("error", (error) => {
        child.kill();
        reject(error);
      });
      child.stdin.on("error", () => {}); // reported through the exit code instead
      io.stdin.pipe(child.stdin);
    } else {
      child.stdin.end();
    }
    child.on("error", (error: NodeJS.ErrnoException) =>
      reject(error.code === "ENOENT" ? new Error(`Couldn't run ${cmd}. Install the MariaDB client tools or Docker.`) : error),
    );
    child.on("close", (code) => {
      if (code === 0) resolve(stdout);
      else reject(new Error(`${cmd} exited with code ${code}${stderr.trim() ? `:\n${stderr.trim()}` : "."}`));
    });
  });
}
