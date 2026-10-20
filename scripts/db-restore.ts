/**
 * Restores the database from a backup made by `npm run db:backup`, replacing ALL
 * current data (including users and sessions).
 *
 *   npm run db:restore -- backups/grantbase-20261020-101500.sql.gz
 *   npm run db:restore -- <file> --yes                  # skip the confirmation
 *   npm run db:restore -- <file> --no-safety-backup     # don't back up first
 *
 * Unless told otherwise, the current database is backed up first, so a mistaken
 * restore can itself be undone.
 */
import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";
import { createGunzip } from "node:zlib";
import { createBackup, displayPath } from "./lib/backup";
import { connectionFromEnv, describeRunner, runTool, type Connection } from "./lib/mariadb";
import { Prompter } from "./lib/prompt";

const USAGE = "Usage: npm run db:restore -- <backup file> [--yes] [--no-safety-backup]";

function isGzip(file: string): boolean {
  const fd = fs.openSync(file, "r");
  try {
    const magic = Buffer.alloc(2);
    fs.readSync(fd, magic, 0, 2, 0);
    return magic[0] === 0x1f && magic[1] === 0x8b;
  } finally {
    fs.closeSync(fd);
  }
}

/** Reads the start of the (possibly gzipped) file to check it is a SQL dump. */
async function looksLikeDump(file: string, gzipped: boolean): Promise<boolean> {
  const source = fs.createReadStream(file, { end: gzipped ? 64 * 1024 : 4096 });
  const stream = gzipped ? source.pipe(createGunzip()) : source;
  let head = "";
  try {
    for await (const chunk of stream) {
      head += (chunk as Buffer).toString("utf8");
      if (head.length >= 4096) break;
    }
  } catch {
    // A truncated read of a gzip stream can error once enough has been read.
  } finally {
    source.destroy();
  }
  return /^-- (MariaDB|MySQL) dump/m.test(head) || /^(CREATE TABLE|DROP TABLE|\/\*!\d+ SET)/m.test(head);
}

async function currentTables(conn: Connection): Promise<string[]> {
  const out = await runTool("client", conn, [
    "--batch",
    "--skip-column-names",
    `--database=${conn.database}`,
    "--execute=SELECT table_name FROM information_schema.tables WHERE table_schema = DATABASE()",
  ]);
  return out.split("\n").map((t) => t.trim()).filter(Boolean);
}

const quoteIdentifier = (name: string) => `\`${name.replace(/`/g, "``")}\``;

async function* restoreScript(file: string, gzipped: boolean, dropTables: string[]): AsyncGenerator<Buffer | string> {
  // Drop every current table first, so tables added after the backup was taken
  // (e.g. by newer migrations) don't linger next to the restored schema.
  yield "SET FOREIGN_KEY_CHECKS=0;\n";
  if (dropTables.length) yield `DROP TABLE IF EXISTS ${dropTables.map(quoteIdentifier).join(", ")};\n`;
  const source = fs.createReadStream(file);
  yield* gzipped ? source.pipe(createGunzip()) : source;
  yield "\nSET FOREIGN_KEY_CHECKS=1;\n";
}

async function main(): Promise<number> {
  const args = process.argv.slice(2);
  const flags = new Set(args.filter((a) => a.startsWith("--")));
  const files = args.filter((a) => !a.startsWith("--"));
  const unknown = [...flags].filter((f) => f !== "--yes" && f !== "--no-safety-backup");
  if (files.length !== 1 || unknown.length) {
    console.error(USAGE);
    return 1;
  }
  const file = path.resolve(files[0]);
  if (!fs.existsSync(file) || !fs.statSync(file).isFile()) {
    console.error(`No such file: ${files[0]}`);
    return 1;
  }
  const gzipped = isGzip(file);
  if (!(await looksLikeDump(file, gzipped))) {
    console.error(`${files[0]} doesn't look like a database backup (expected a .sql or .sql.gz file from npm run db:backup).`);
    return 1;
  }

  const conn = connectionFromEnv();
  console.log(`Restore ${path.basename(file)} into database "${conn.database}" on ${conn.host}:${conn.port}.`);
  console.log("This permanently replaces ALL current data, including users, passwords and sessions.");

  if (!flags.has("--yes")) {
    const p = new Prompter();
    try {
      const answer = await p.ask(`Type the database name (${conn.database}) to continue: `);
      if (answer !== conn.database) {
        console.log("Cancelled. Nothing was changed.");
        return 1;
      }
    } finally {
      p.close();
    }
  }

  if (!flags.has("--no-safety-backup")) {
    console.log("Backing up the current database first…");
    const safety = await createBackup(conn, undefined, "-before-restore");
    console.log(`  Saved to ${displayPath(safety)}`);
  }

  console.log(`Restoring using ${describeRunner("client")}…`);
  const tables = await currentTables(conn);
  await runTool("client", conn, ["--default-character-set=utf8mb4", `--database=${conn.database}`], {
    stdin: Readable.from(restoreScript(file, gzipped, tables)),
  });

  console.log("\nRestore complete.");
  console.log("  - If the backup is from an older version of the app, run: npm run db:deploy");
  console.log("  - Users are signed in or out as they were when the backup was taken.");
  return 0;
}

main().then(
  (code) => process.exit(code),
  (error: unknown) => {
    // Only the message: driver output never includes the password, which is passed via MYSQL_PWD.
    console.error(`Restore failed: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  },
);
