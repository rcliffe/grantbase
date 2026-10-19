import "server-only";
import { APIError } from "better-auth/api";
import { normaliseEmail } from "@/lib/email";
import { env } from "@/server/env";
import { auth } from "./better-auth";
import { CHANGE_PASSWORD_LIMIT, SIGN_IN_EMAIL_LIMIT, SIGN_IN_IP_LIMIT } from "./config";
import { clientIp, consumeRateLimit, pruneRateLimits, resetRateLimit } from "./rate-limit";

/**
 * Authentication use-cases, independent of Next.js forms. Server Actions call these;
 * tests call them directly with explicit request headers.
 *
 * Every function returns the Better Auth response headers (Set-Cookie). Inside a
 * Server Action the nextCookies plugin has already applied them to the response.
 */

export type SignInResult =
  | { ok: true; responseHeaders: Headers }
  | { ok: false; reason: "invalid" }
  | { ok: false; reason: "rate_limited"; retryAfterSeconds: number };

export async function signInWithPassword(
  credentials: { email: string; password: string },
  requestHeaders: Headers,
): Promise<SignInResult> {
  const email = normaliseEmail(credentials.email);
  const ipKey = `sign-in:ip:${clientIp(requestHeaders, env().TRUSTED_PROXY_COUNT)}`;
  const emailKey = `sign-in:email:${email}`;

  // Both buckets are counted before the password is checked, so failed and
  // successful attempts cost the same and limits apply to unknown emails too.
  const [byIp, byEmail] = await Promise.all([
    consumeRateLimit(ipKey, SIGN_IN_IP_LIMIT),
    consumeRateLimit(emailKey, SIGN_IN_EMAIL_LIMIT),
  ]);
  if (!byIp.allowed || !byEmail.allowed) {
    return {
      ok: false,
      reason: "rate_limited",
      retryAfterSeconds: Math.max(byIp.retryAfterSeconds, byEmail.retryAfterSeconds),
    };
  }

  // Occasional housekeeping; never blocks or fails sign-in.
  if (Math.random() < 0.01) void pruneRateLimits().catch(() => {});

  try {
    // Unknown email, wrong password and deactivated account (session hook returns
    // false) all surface as an APIError and are reported identically.
    const { headers: responseHeaders } = await auth().api.signInEmail({
      body: { email, password: credentials.password, rememberMe: true },
      headers: requestHeaders,
      returnHeaders: true,
    });
    await resetRateLimit(emailKey);
    return { ok: true, responseHeaders };
  } catch (error) {
    if (error instanceof APIError) return { ok: false, reason: "invalid" };
    throw error;
  }
}

/** Deletes the server-side session identified by the request cookie and clears the cookie. */
export async function signOutSession(requestHeaders: Headers): Promise<Headers> {
  const { headers: responseHeaders } = await auth().api.signOut({
    headers: requestHeaders,
    returnHeaders: true,
  });
  return responseHeaders;
}

export type ChangePasswordResult =
  | { ok: true; responseHeaders: Headers }
  | { ok: false; reason: "invalid_current" | "unauthenticated" }
  | { ok: false; reason: "rate_limited"; retryAfterSeconds: number };

/**
 * Changes the signed-in user's password after verifying the current one. All of the
 * user's sessions are revoked and a fresh session is issued for this browser.
 */
export async function changeOwnPassword(
  userId: string,
  input: { currentPassword: string; newPassword: string },
  requestHeaders: Headers,
): Promise<ChangePasswordResult> {
  const key = `change-password:user:${userId}`;
  const limit = await consumeRateLimit(key, CHANGE_PASSWORD_LIMIT);
  if (!limit.allowed) {
    return { ok: false, reason: "rate_limited", retryAfterSeconds: limit.retryAfterSeconds };
  }

  try {
    const { headers: responseHeaders } = await auth().api.changePassword({
      body: { ...input, revokeOtherSessions: true },
      headers: requestHeaders,
      returnHeaders: true,
    });
    await resetRateLimit(key);
    return { ok: true, responseHeaders };
  } catch (error) {
    if (error instanceof APIError) {
      return { ok: false, reason: error.statusCode === 401 ? "unauthenticated" : "invalid_current" };
    }
    throw error;
  }
}
