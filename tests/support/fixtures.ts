import { expect } from "vitest";
import type { Role } from "@/lib/roles";
import { signInWithPassword } from "@/server/auth/service";
import { db } from "@/server/db/client";
import { createUser, type UserSummary } from "@/server/users/service";
import { requestHeaders } from "./request";

export const PASSWORD = "correct horse battery staple";

/** Empties every table. Only ever runs against the *_test database (see test-env.ts). */
export async function resetDatabase(): Promise<void> {
  const prisma = db();
  // Children before parents; DELETE rather than TRUNCATE so foreign keys stay enforced.
  await prisma.grant.deleteMany();
  await prisma.charity.deleteMany();
  await prisma.grantCategory.deleteMany();
  await prisma.grantStatus.deleteMany();
  await prisma.session.deleteMany();
  await prisma.account.deleteMany();
  await prisma.verification.deleteMany();
  await prisma.rateLimit.deleteMany();
  await prisma.user.deleteMany();
}

let counter = 0;

export async function makeUser(role: Role = "VIEWER", overrides: Partial<{ email: string; name: string }> = {}): Promise<UserSummary> {
  counter += 1;
  return createUser({
    name: overrides.name ?? `${role.toLowerCase()} ${counter}`,
    email: overrides.email ?? `${role.toLowerCase()}${counter}@example.test`,
    role,
    password: PASSWORD,
  });
}

/** Extracts `name=value` pairs from Set-Cookie headers, suitable for a Cookie header. */
export function cookieHeaderFrom(responseHeaders: Headers): string {
  return responseHeaders
    .getSetCookie()
    .map((c) => c.split(";")[0])
    .filter((pair) => !pair.endsWith("="))
    .join("; ");
}

/** Signs in and returns the session cookie header. */
export async function signIn(email: string, password = PASSWORD, ip?: string): Promise<string> {
  const result = await signInWithPassword({ email, password }, requestHeaders("", ip));
  expect(result.ok, `sign-in for ${email} should succeed`).toBe(true);
  if (!result.ok) throw new Error("unreachable");
  const cookie = cookieHeaderFrom(result.responseHeaders);
  expect(cookie).toMatch(/session_token=/);
  return cookie;
}

/** Asserts that `promise` rejects with a Next.js redirect whose URL matches the regex source `path`. */
export async function expectRedirect(promise: Promise<unknown>, path: string): Promise<void> {
  await expect(promise).rejects.toMatchObject({
    digest: expect.stringMatching(new RegExp(`^NEXT_REDIRECT;(replace|push);${path};`)),
  });
}

export function formData(entries: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(entries)) fd.set(k, v);
  return fd;
}
