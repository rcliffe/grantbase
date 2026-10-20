import fs from "node:fs";
import path from "node:path";
import { finished } from "node:stream/promises";
import { createGzip } from "node:zlib";
import { runTool, type Connection } from "./mariadb";

export const BACKUP_DIR = path.resolve(process.cwd(), "backups");

/** Options that give a consistent, complete, restorable dump of one database. */
const DUMP_OPTIONS = [
  "--single-transaction", // consistent snapshot of InnoDB tables without locking the app out
  "--quick",
  "--routines",
  "--triggers",
  "--hex-blob",
  "--no-tablespaces",
  "--default-character-set=utf8mb4",
];

function timestamp(date = new Date()): string {
  return date.toISOString().replace(/\.\d+Z$/, "").replace(/[-:]/g, "").replace("T", "-");
}

/**
 * Writes a gzipped SQL dump of the whole database (schema, data and the migrations
 * table) and returns its path. The file is only readable by the current user: it
 * contains password hashes and session tokens.
 */
export async function createBackup(conn: Connection, output?: string, label = ""): Promise<string> {
  const target = path.resolve(output ?? path.join(BACKUP_DIR, `${conn.database}-${timestamp()}${label}.sql.gz`));
  fs.mkdirSync(path.dirname(target), { recursive: true, mode: 0o700 });
  if (fs.existsSync(target)) throw new Error(`${target} already exists.`);

  const partial = `${target}.partial`;
  const file = fs.createWriteStream(partial, { mode: 0o600 });
  const gzip = createGzip();
  gzip.pipe(file);
  try {
    await runTool("dump", conn, [...DUMP_OPTIONS, conn.database], { stdout: gzip });
    gzip.end();
    await finished(file);
    fs.renameSync(partial, target);
  } catch (error) {
    gzip.destroy();
    file.destroy();
    fs.rmSync(partial, { force: true });
    throw error;
  }
  return target;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/** Path relative to the project when inside it, absolute otherwise. */
export function displayPath(file: string): string {
  const relative = path.relative(process.cwd(), file);
  return relative && !relative.startsWith("..") && !path.isAbsolute(relative) ? relative : file;
}
