import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { makeUser, resetDatabase } from "./support/fixtures";
import { requestHeaders } from "./support/request";

/**
 * Production cookie and environment rules. Modules are re-imported after switching
 * NODE_ENV so the auth instance is built with production settings.
 */
const saved = { ...process.env };
const globals = globalThis as { auth?: unknown; prisma?: { $disconnect(): Promise<void> } };

async function freshModules() {
  vi.resetModules();
  delete globals.auth;
  await globals.prisma?.$disconnect();
  delete globals.prisma;
}

describe("production configuration", () => {
  beforeAll(async () => {
    await resetDatabase();
  });

  afterAll(async () => {
    process.env = { ...saved };
    await freshModules();
  });

  it("refuses to start in production without an https:// base URL", async () => {
    await freshModules();
    process.env = { ...saved, NODE_ENV: "production", BETTER_AUTH_URL: "http://app.example.test" };
    const { env } = await import("@/server/env");
    expect(() => env()).toThrow(/BETTER_AUTH_URL must use https/);
  });

  it("refuses a short session secret without echoing it", async () => {
    await freshModules();
    process.env = { ...saved, BETTER_AUTH_SECRET: "too-short-secret" };
    const { env } = await import("@/server/env");
    expect(() => env()).toThrow(/BETTER_AUTH_SECRET must be at least 32 characters/);
    expect(() => env()).not.toThrow(/too-short-secret/);
  });

  it("issues Secure, __Secure- prefixed, HttpOnly, SameSite=Lax cookies in production", async () => {
    await freshModules();
    process.env = { ...saved, NODE_ENV: "production", BETTER_AUTH_URL: "https://app.example.test" };
    const { signInWithPassword } = await import("@/server/auth/service");
    const user = await makeUser();

    const result = await signInWithPassword({ email: user.email, password: "correct horse battery staple" }, requestHeaders());
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const cookie = result.responseHeaders.getSetCookie().find((c) => c.includes("session_token"));
    expect(cookie).toMatch(/^__Secure-gb\.session_token=/);
    expect(cookie).toMatch(/;\s*Secure/i);
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=Lax/i);
  });
});
