/**
 * Backs up the whole database to a gzipped SQL file.
 *
 *   npm run db:backup                         # backups/<db>-<timestamp>.sql.gz
 *   npm run db:backup -- path/to/file.sql.gz
 *
 * Backups contain password hashes and session tokens: store them as securely as the
 * database itself.
 */
import "dotenv/config";
import fs from "node:fs";
import { createBackup, displayPath, formatBytes } from "./lib/backup";
import { connectionFromEnv, describeRunner } from "./lib/mariadb";

async function main(): Promise<number> {
  const args = process.argv.slice(2);
  if (args.length > 1 || args[0]?.startsWith("-")) {
    console.error("Usage: npm run db:backup [-- <output file>]");
    return 1;
  }
  const conn = connectionFromEnv();
  console.log(`Backing up database "${conn.database}" using ${describeRunner("dump")}…`);
  const file = await createBackup(conn, args[0]);
  console.log(`Backup written to ${displayPath(file)} (${formatBytes(fs.statSync(file).size)}).`);
  return 0;
}

main().then(
  (code) => process.exit(code),
  (error: unknown) => {
    console.error(`Backup failed: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  },
);
