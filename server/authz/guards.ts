import "server-only";
import { redirect } from "next/navigation";
import { hasRole, type Role } from "@/lib/roles";
import { getCurrentSession, type SessionUser } from "@/server/auth/session";

export const SIGN_IN_PATH = "/sign-in";
export const FORBIDDEN_PATH = "/forbidden";

/**
 * Server-side guards. Call one at the top of EVERY protected page, route handler and
 * Server Action, close to the data it protects. Layouts and hidden UI are not a
 * security boundary: actions and routes can be invoked directly.
 */

/** The signed-in user, or null. Use for pages that adapt to, but don't require, a session. */
export async function getOptionalUser(): Promise<SessionUser | null> {
  return (await getCurrentSession())?.user ?? null;
}

/** The signed-in user; otherwise redirects to the sign-in page. */
export async function requireUser(): Promise<SessionUser> {
  const user = await getOptionalUser();
  if (!user) redirect(SIGN_IN_PATH);
  return user;
}

/**
 * The signed-in user if their role is at least `minimum`. Redirects unauthenticated
 * users to sign-in and under-privileged users to the forbidden page.
 */
export async function requireRole(minimum: Role): Promise<SessionUser> {
  const user = await requireUser();
  if (!hasRole(user.role, minimum)) redirect(FORBIDDEN_PATH);
  return user;
}

export function requireAdmin(): Promise<SessionUser> {
  return requireRole("ADMINISTRATOR");
}
