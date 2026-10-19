import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { changeOwnPassword, signInWithPassword } from "@/server/auth/service";
import { getSessionFromHeaders } from "@/server/auth/session";
import { db } from "@/server/db/client";
import { resetUserPassword, setUserActive } from "@/server/users/service";
import { cookieHeaderFrom, makeUser, PASSWORD, resetDatabase, signIn } from "./support/fixtures";
import { requestHeaders } from "./support/request";

beforeEach(resetDatabase);
afterAll(() => db().$disconnect());

describe("deactivated accounts", () => {
  it("revokes every session when a user is deactivated", async () => {
    const admin = await makeUser("ADMINISTRATOR");
    const user = await makeUser("EDITOR");
    const a = await signIn(user.email);
    const b = await signIn(user.email);

    await setUserActive(user.id, false, admin.id);

    expect(await db().session.count({ where: { userId: user.id } })).toBe(0);
    expect(await getSessionFromHeaders(requestHeaders(a))).toBeNull();
    expect(await getSessionFromHeaders(requestHeaders(b))).toBeNull();
  });

  it("refuses sign-in with the correct password, using the generic error", async () => {
    const admin = await makeUser("ADMINISTRATOR");
    const user = await makeUser();
    await setUserActive(user.id, false, admin.id);

    const result = await signInWithPassword({ email: user.email, password: PASSWORD }, requestHeaders());
    expect(result).toEqual({ ok: false, reason: "invalid" });
    expect(await db().session.count()).toBe(0);
  });

  it("ignores a surviving session row for a deactivated user (defence in depth)", async () => {
    const user = await makeUser();
    const cookie = await signIn(user.email);
    // Simulate a deactivation that bypassed the service layer.
    await db().user.update({ where: { id: user.id }, data: { active: false } });

    expect(await getSessionFromHeaders(requestHeaders(cookie))).toBeNull();
  });

  it("allows sign-in again after reactivation", async () => {
    const admin = await makeUser("ADMINISTRATOR");
    const user = await makeUser();
    await setUserActive(user.id, false, admin.id);
    await setUserActive(user.id, true, admin.id);
    await expect(signIn(user.email)).resolves.toMatch(/session_token=/);
  });
});

describe("administrator password reset", () => {
  it("replaces the password and revokes all sessions", async () => {
    const user = await makeUser();
    const cookie = await signIn(user.email);

    await resetUserPassword(user.id, "a brand new long password");

    expect(await getSessionFromHeaders(requestHeaders(cookie))).toBeNull();
    expect(await signInWithPassword({ email: user.email, password: PASSWORD }, requestHeaders())).toEqual({
      ok: false,
      reason: "invalid",
    });
    await expect(signIn(user.email, "a brand new long password")).resolves.toBeTruthy();
  });

  it("stores the password as an Argon2id hash, never in clear", async () => {
    const user = await makeUser();
    const account = await db().account.findFirstOrThrow({ where: { userId: user.id, providerId: "credential" } });
    expect(account.password).toMatch(/^\$argon2id\$v=19\$m=19456,t=2,p=1\$/);
    expect(account.password).not.toContain(PASSWORD);
  });
});

describe("changing your own password", () => {
  it("requires the current password", async () => {
    const user = await makeUser();
    const cookie = await signIn(user.email);
    const result = await changeOwnPassword(
      user.id,
      { currentPassword: "wrong current password", newPassword: "another long password" },
      requestHeaders(cookie),
    );
    expect(result).toEqual({ ok: false, reason: "invalid_current" });
    await expect(signIn(user.email)).resolves.toBeTruthy();
  });

  it("revokes other sessions and issues a fresh one for this browser", async () => {
    const user = await makeUser();
    const current = await signIn(user.email);
    const other = await signIn(user.email);

    const result = await changeOwnPassword(
      user.id,
      { currentPassword: PASSWORD, newPassword: "another long password" },
      requestHeaders(current),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(await getSessionFromHeaders(requestHeaders(other))).toBeNull();
    expect(await getSessionFromHeaders(requestHeaders(current))).toBeNull();
    const fresh = cookieHeaderFrom(result.responseHeaders);
    expect((await getSessionFromHeaders(requestHeaders(fresh)))?.user.id).toBe(user.id);
    expect(await db().session.count({ where: { userId: user.id } })).toBe(1);
  });

  it("is unavailable without a valid session", async () => {
    const user = await makeUser();
    const result = await changeOwnPassword(
      user.id,
      { currentPassword: PASSWORD, newPassword: "another long password" },
      requestHeaders(),
    );
    expect(result).toEqual({ ok: false, reason: "unauthenticated" });
  });
});
