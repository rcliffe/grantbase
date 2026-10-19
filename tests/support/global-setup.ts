import { execFileSync } from "node:child_process";
import { loadTestEnv } from "./test-env";

/** Applies all migrations to the test database once per run. */
export default function setup(): void {
  loadTestEnv();
  execFileSync("npx", ["prisma", "migrate", "deploy"], {
    stdio: ["ignore", "ignore", "inherit"],
    env: process.env,
  });
}
