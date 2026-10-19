import "server-only";
import { headers } from "next/headers";
import { cache } from "react";
import { isRole, type Role } from "@/lib/roles";
import { auth } from "./better-auth";

/** The only user shape that leaves the auth layer. No hashes, tokens or secrets. */
export type SessionUser = {
  id: string;
  name: string;
  email: string;
  role: Role;
};

export type CurrentSession = {
  user: SessionUser;
  session: { id: string; expiresAt: Date };
};

/**
 * Validates the session cookie in `requestHeaders` against the database.
 * Returns null for a missing, tampered, expired or revoked session, or for a user who
 * is deactivated or has an unrecognised role.
 */
export async function getSessionFromHeaders(requestHeaders: Headers): Promise<CurrentSession | null> {
  const result = await auth().api.getSession({ headers: requestHeaders });
  if (!result) return null;

  const { user, session } = result;
  if (user.active !== true || !isRole(user.role)) return null;

  return {
    user: { id: user.id, name: user.name, email: user.email, role: user.role },
    session: { id: session.id, expiresAt: new Date(session.expiresAt) },
  };
}

/**
 * Session for the current request, deduplicated per request with React `cache`, so
 * a layout and page that both ask for it hit the database once.
 */
export const getCurrentSession = cache(async (): Promise<CurrentSession | null> => {
  return getSessionFromHeaders(await headers());
});
