import "server-only";
import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { nextCookies } from "better-auth/next-js";
import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from "@/lib/validation";
import { db } from "@/server/db/client";
import { env } from "@/server/env";
import { SESSION_REFRESH_AGE_SECONDS, SESSION_TTL_SECONDS } from "./config";
import { hashPassword, verifyPassword } from "./password";

/**
 * Better Auth instance: email/password credentials, database sessions, signed
 * HTTP-only cookies.
 *
 * The Better Auth HTTP handler is intentionally NOT mounted (there is no
 * /api/auth/[...all] route). Every flow goes through Server Actions that call
 * `auth.api.*` directly, so no sign-up, admin or password-reset endpoints are exposed,
 * and Next.js's Server Action Origin check provides CSRF protection.
 */
function createAuth() {
  const config = env();
  return betterAuth({
    appName: "Grantbase",
    baseURL: config.BETTER_AUTH_URL,
    secret: config.BETTER_AUTH_SECRET,
    database: prismaAdapter(db(), { provider: "mysql" }),
    telemetry: { enabled: false },
    emailAndPassword: {
      enabled: true,
      disableSignUp: true,
      minPasswordLength: PASSWORD_MIN_LENGTH,
      maxPasswordLength: PASSWORD_MAX_LENGTH,
      revokeSessionsOnPasswordReset: true,
      password: {
        hash: hashPassword,
        verify: ({ hash, password }) => verifyPassword(hash, password),
      },
    },
    user: {
      additionalFields: {
        // input: false — these can never be set through Better Auth endpoints.
        role: { type: "string", input: false, defaultValue: "VIEWER" },
        active: { type: "boolean", input: false, defaultValue: true },
      },
    },
    session: {
      expiresIn: SESSION_TTL_SECONDS,
      updateAge: SESSION_REFRESH_AGE_SECONDS,
      // No cookie cache: every request validates the session against the database,
      // so revocation (sign-out, deactivation, password reset) takes effect at once.
      cookieCache: { enabled: false },
    },
    // Built-in limiter only applies to the HTTP handler, which isn't mounted.
    // Sign-in is limited across instances by server/auth/rate-limit.ts instead.
    rateLimit: { enabled: false },
    advanced: {
      cookiePrefix: "gb",
      // Secure + __Secure- prefix in production: cookies are only sent over HTTPS.
      useSecureCookies: config.NODE_ENV === "production",
      defaultCookieAttributes: { httpOnly: true, sameSite: "lax", path: "/" },
    },
    databaseHooks: {
      session: {
        create: {
          // Defence in depth: never issue a session to a deactivated account,
          // whichever code path asks for one.
          before: async (session) => {
            const user = await db().user.findUnique({
              where: { id: session.userId },
              select: { active: true },
            });
            if (!user?.active) return false;
          },
        },
      },
    },
    plugins: [nextCookies()], // must stay last
  });
}

type Auth = ReturnType<typeof createAuth>;
const globalForAuth = globalThis as unknown as { auth?: Auth };

export function auth(): Auth {
  globalForAuth.auth ??= createAuth();
  return globalForAuth.auth;
}
