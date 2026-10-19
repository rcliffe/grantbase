import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { SIGN_IN_EMAIL_LIMIT, SIGN_IN_IP_LIMIT } from "@/server/auth/config";
import { signInWithPassword, signOutSession } from "@/server/auth/service";
import { getSessionFromHeaders } from "@/server/auth/session";
import { db } from "@/server/db/client";
import { cookieHeaderFrom, makeUser, PASSWORD, resetDatabase, signIn } from "./support/fixtures";
import { requestHeaders } from "./support/request";

beforeEach(resetDatabase);
afterAll(() => db().$disconnect());

describe("sign-in", () => {
  it("creates a database session and a hardened session cookie", async () => {
    const user = await makeUser("EDITOR");
    const result = await signInWithPassword({ email: user.email, password: PASSWORD }, requestHeaders());
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const [setCookie] = result.responseHeaders.getSetCookie().filter((c) => c.includes("session_token"));
    expect(setCookie).toMatch(/HttpOnly/i);
    expect(setCookie).toMatch(/SameSite=Lax/i);
    expect(setCookie).toMatch(/Path=\//i);

    expect(await db().session.count({ where: { userId: user.id } })).toBe(1);

    const session = await getSessionFromHeaders(requestHeaders(cookieHeaderFrom(result.responseHeaders)));
    // Only the narrow, safe user shape leaves the auth layer.
    expect(session?.user).toEqual({ id: user.id, name: user.name, email: user.email, role: "EDITOR" });
  });

  it("applies the email normalisation policy", async () => {
    const user = await makeUser("VIEWER", { email: "mixed.case@example.test" });
    await expect(signIn("  Mixed.CASE@Example.TEST ")).resolves.toMatch(/session_token=/);
    expect(user.email).toBe("mixed.case@example.test");
  });

  it("returns the same generic failure for a wrong password and an unknown account", async () => {
    const user = await makeUser();
    const wrongPassword = await signInWithPassword({ email: user.email, password: "not the password" }, requestHeaders());
    const unknownUser = await signInWithPassword({ email: "nobody@example.test", password: PASSWORD }, requestHeaders());

    expect(wrongPassword).toEqual({ ok: false, reason: "invalid" });
    expect(unknownUser).toEqual(wrongPassword);
    expect(await db().session.count()).toBe(0);
  });

  it("rejects a forged or tampered session cookie", async () => {
    const user = await makeUser();
    const cookie = await signIn(user.email);
    const tampered = cookie.replace(/session_token=([^.;]+)/, "session_token=$1x");
    expect(await getSessionFromHeaders(requestHeaders(tampered))).toBeNull();
    expect(await getSessionFromHeaders(requestHeaders("gb.session_token=made-up.value"))).toBeNull();
    expect(await getSessionFromHeaders(requestHeaders())).toBeNull();
  });
});

describe("rate limiting", () => {
  it("locks an email after too many attempts, even with the right password, from any IP", async () => {
    const user = await makeUser();
    for (let i = 0; i < SIGN_IN_EMAIL_LIMIT.limit; i++) {
      const r = await signInWithPassword({ email: user.email, password: "wrong" }, requestHeaders("", `198.51.100.${i}`));
      expect(r).toEqual({ ok: false, reason: "invalid" });
    }
    const blocked = await signInWithPassword({ email: user.email, password: PASSWORD }, requestHeaders("", "198.51.100.200"));
    expect(blocked).toMatchObject({ ok: false, reason: "rate_limited" });
    if (!blocked.ok && blocked.reason === "rate_limited") expect(blocked.retryAfterSeconds).toBeGreaterThan(0);
    expect(await db().session.count()).toBe(0);
  });

  it("limits a single IP across many emails", async () => {
    for (let i = 0; i < SIGN_IN_IP_LIMIT.limit; i++) {
      await signInWithPassword({ email: `probe${i}@example.test`, password: "x" }, requestHeaders("", "192.0.2.50"));
    }
    const user = await makeUser();
    const blocked = await signInWithPassword({ email: user.email, password: PASSWORD }, requestHeaders("", "192.0.2.50"));
    expect(blocked).toMatchObject({ ok: false, reason: "rate_limited" });
    // A different IP is unaffected.
    await expect(signIn(user.email, PASSWORD, "192.0.2.51")).resolves.toBeTruthy();
  });

  it("stores only hashed bucket keys and resets the email bucket after success", async () => {
    const user = await makeUser();
    await signInWithPassword({ email: user.email, password: "wrong" }, requestHeaders());
    const rows = await db().rateLimit.findMany();
    expect(rows.length).toBe(2);
    for (const row of rows) expect(row.key).toMatch(/^[0-9a-f]{64}$/);

    await signIn(user.email);
    expect(await db().rateLimit.count()).toBe(1); // only the IP bucket remains
  });
});

describe("sign-out", () => {
  it("deletes the server-side session and clears the cookie", async () => {
    const user = await makeUser();
    const cookie = await signIn(user.email);
    expect(await getSessionFromHeaders(requestHeaders(cookie))).not.toBeNull();

    const responseHeaders = await signOutSession(requestHeaders(cookie));

    expect(await db().session.count({ where: { userId: user.id } })).toBe(0);
    const cleared = responseHeaders.getSetCookie().find((c) => c.includes("session_token"));
    expect(cleared).toMatch(/Max-Age=0/i);
    // Replaying the old cookie no longer works: the session is gone server-side.
    expect(await getSessionFromHeaders(requestHeaders(cookie))).toBeNull();
  });

  it("only ends the current session, not the user's other sessions", async () => {
    const user = await makeUser();
    const laptop = await signIn(user.email);
    const desktop = await signIn(user.email);

    await signOutSession(requestHeaders(laptop));

    expect(await getSessionFromHeaders(requestHeaders(laptop))).toBeNull();
    expect(await getSessionFromHeaders(requestHeaders(desktop))).not.toBeNull();
  });
});

describe("session expiry", () => {
  it("rejects a session whose expiry has passed", async () => {
    const user = await makeUser();
    const cookie = await signIn(user.email);
    await db().session.updateMany({ where: { userId: user.id }, data: { expiresAt: new Date(Date.now() - 1000) } });

    expect(await getSessionFromHeaders(requestHeaders(cookie))).toBeNull();
  });

  it("issues sessions that expire after the configured lifetime", async () => {
    const user = await makeUser();
    const before = Date.now();
    await signIn(user.email);
    const session = await db().session.findFirstOrThrow({ where: { userId: user.id } });
    const { SESSION_TTL_SECONDS } = await import("@/server/auth/config");
    const ttl = session.expiresAt.getTime() - before;
    expect(ttl).toBeGreaterThan(SESSION_TTL_SECONDS * 1000 - 5_000);
    expect(ttl).toBeLessThanOrEqual(SESSION_TTL_SECONDS * 1000 + 5_000);
  });
});
