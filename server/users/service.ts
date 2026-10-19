import "server-only";
import { randomUUID } from "node:crypto";
import { Prisma } from "@/generated/prisma/client";
import { normaliseEmail } from "@/lib/email";
import type { Role } from "@/lib/roles";
import { hashPassword } from "@/server/auth/password";
import { db } from "@/server/db/client";

/**
 * User data-access layer. All user reads and writes go through here so that:
 * - only safe columns are ever selected (never password hashes or session tokens),
 * - emails are always normalised,
 * - invariants (last active administrator, session revocation) hold for every caller,
 *   including the CLI commands.
 *
 * This module does NOT check who is calling: callers must authorise first
 * (see server/authz).
 */

export const CREDENTIAL_PROVIDER_ID = "credential";

export const userSummarySelect = {
  id: true,
  name: true,
  email: true,
  role: true,
  active: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.UserSelect;

export type UserSummary = Prisma.UserGetPayload<{ select: typeof userSummarySelect }>;

export type UserErrorCode = "EMAIL_TAKEN" | "NOT_FOUND" | "LAST_ADMIN" | "SELF_DEACTIVATION";

export class UserManagementError extends Error {
  constructor(
    public readonly code: UserErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "UserManagementError";
  }
}

type Tx = Prisma.TransactionClient;

export async function listUsers(): Promise<UserSummary[]> {
  return db().user.findMany({
    select: userSummarySelect,
    orderBy: [{ active: "desc" }, { name: "asc" }],
  });
}

export async function getUserById(id: string): Promise<UserSummary | null> {
  return db().user.findUnique({ where: { id }, select: userSummarySelect });
}

export async function findUserByEmail(email: string): Promise<UserSummary | null> {
  return db().user.findUnique({ where: { email: normaliseEmail(email) }, select: userSummarySelect });
}

export async function countActiveAdministrators(): Promise<number> {
  return db().user.count({ where: { role: "ADMINISTRATOR", active: true } });
}

export async function createUser(input: {
  name: string;
  email: string;
  role: Role;
  password: string;
}): Promise<UserSummary> {
  const id = randomUUID();
  const passwordHash = await hashPassword(input.password);
  try {
    return await db().user.create({
      data: {
        id,
        name: input.name.trim(),
        email: normaliseEmail(input.email),
        role: input.role,
        accounts: {
          create: { providerId: CREDENTIAL_PROVIDER_ID, accountId: id, password: passwordHash },
        },
      },
      select: userSummarySelect,
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new UserManagementError("EMAIL_TAKEN", "A user with that email address already exists.");
    }
    throw error;
  }
}

/**
 * Locks every active administrator row for the rest of the transaction, so two
 * concurrent demotions/deactivations can't both pass the last-admin check.
 */
async function lockActiveAdministrators(tx: Tx): Promise<string[]> {
  const rows = await tx.$queryRaw<{ id: string }[]>`
    SELECT id FROM users WHERE role = 'ADMINISTRATOR' AND active = 1 FOR UPDATE`;
  return rows.map((r) => r.id);
}

async function assertNotLastAdministrator(tx: Tx, userId: string): Promise<void> {
  const admins = await lockActiveAdministrators(tx);
  if (admins.includes(userId) && admins.length <= 1) {
    throw new UserManagementError(
      "LAST_ADMIN",
      "This is the last active administrator. Promote another user to administrator first.",
    );
  }
}

export async function changeUserRole(userId: string, role: Role): Promise<UserSummary> {
  return db().$transaction(async (tx) => {
    if (role !== "ADMINISTRATOR") await assertNotLastAdministrator(tx, userId);
    const existing = await tx.user.findUnique({ where: { id: userId }, select: { id: true } });
    if (!existing) throw new UserManagementError("NOT_FOUND", "User not found.");
    return tx.user.update({ where: { id: userId }, data: { role }, select: userSummarySelect });
  });
}

/**
 * Deactivating a user also revokes all of their sessions in the same transaction.
 * `actorId` is the administrator performing the change; they can't deactivate themselves.
 */
export async function setUserActive(userId: string, active: boolean, actorId?: string): Promise<UserSummary> {
  if (!active && actorId === userId) {
    throw new UserManagementError("SELF_DEACTIVATION", "You can't deactivate your own account.");
  }
  return db().$transaction(async (tx) => {
    if (!active) await assertNotLastAdministrator(tx, userId);
    const existing = await tx.user.findUnique({ where: { id: userId }, select: { id: true } });
    if (!existing) throw new UserManagementError("NOT_FOUND", "User not found.");
    const user = await tx.user.update({ where: { id: userId }, data: { active }, select: userSummarySelect });
    if (!active) await tx.session.deleteMany({ where: { userId } });
    return user;
  });
}

/**
 * Administrator password reset: replaces the credential and revokes every session
 * for the user, in one transaction.
 */
export async function resetUserPassword(userId: string, newPassword: string): Promise<void> {
  const passwordHash = await hashPassword(newPassword);
  await db().$transaction(async (tx) => {
    const existing = await tx.user.findUnique({ where: { id: userId }, select: { id: true } });
    if (!existing) throw new UserManagementError("NOT_FOUND", "User not found.");
    await tx.account.upsert({
      where: { providerId_accountId: { providerId: CREDENTIAL_PROVIDER_ID, accountId: userId } },
      create: { providerId: CREDENTIAL_PROVIDER_ID, accountId: userId, userId, password: passwordHash },
      update: { password: passwordHash },
    });
    await tx.session.deleteMany({ where: { userId } });
  });
}

export async function revokeAllSessions(userId: string): Promise<number> {
  const { count } = await db().session.deleteMany({ where: { userId } });
  return count;
}

export async function countActiveSessions(userId: string): Promise<number> {
  return db().session.count({ where: { userId, expiresAt: { gt: new Date() } } });
}
