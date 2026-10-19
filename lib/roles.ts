/**
 * Role definitions shared by server and client code. These are plain data: importing
 * them into a Client Component is safe, but checks made in the browser are cosmetic
 * only. Enforcement lives in server/authz.
 */
export const ROLES = ["ADMINISTRATOR", "EDITOR", "VIEWER"] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_LABELS: Record<Role, string> = {
  ADMINISTRATOR: "Administrator",
  EDITOR: "Editor",
  VIEWER: "Viewer",
};

export const ROLE_DESCRIPTIONS: Record<Role, string> = {
  ADMINISTRATOR: "Full access, including user management.",
  EDITOR: "Can create and change content.",
  VIEWER: "Read-only access.",
};

/** Higher rank includes the permissions of every lower rank. */
const ROLE_RANK: Record<Role, number> = {
  VIEWER: 1,
  EDITOR: 2,
  ADMINISTRATOR: 3,
};

/** True when `role` is at least as privileged as `minimum`. */
export function hasRole(role: Role, minimum: Role): boolean {
  return ROLE_RANK[role] >= ROLE_RANK[minimum];
}

export function isRole(value: unknown): value is Role {
  return typeof value === "string" && (ROLES as readonly string[]).includes(value);
}
