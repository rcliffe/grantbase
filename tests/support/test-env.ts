import { config } from "dotenv";

/**
 * Points the app at the test database. Refuses to run against anything that doesn't
 * look like a dedicated test database, because the suite TRUNCATEs every table.
 */
export function loadTestEnv(): void {
  config({ quiet: true });
  const url = process.env.TEST_DATABASE_URL;
  if (!url) throw new Error("TEST_DATABASE_URL is not set. See .env.example.");
  const dbName = new URL(url).pathname.replace(/^\//, "");
  if (!dbName.endsWith("_test")) {
    throw new Error(`TEST_DATABASE_URL must name a database ending in "_test" (got "${dbName}").`);
  }
  // Workers inherit the environment prepared by global setup, hence the marker.
  if (url === process.env.DATABASE_URL && process.env.TEST_ENV_LOADED !== "1") {
    throw new Error("TEST_DATABASE_URL must differ from DATABASE_URL.");
  }

  process.env.TEST_ENV_LOADED = "1";
  process.env.DATABASE_URL = url;
  process.env.BETTER_AUTH_URL = "http://localhost:3000";
  process.env.BETTER_AUTH_SECRET ||= "test-secret-test-secret-test-secret-0123";
  process.env.TRUSTED_PROXY_COUNT = "0";
}
