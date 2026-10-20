import "server-only";
import { Prisma } from "@/generated/prisma/client";
import { isLookupTone, LOOKUP_CONFIG, STANDARD_GRANT_STATUSES, type LookupInput, type LookupKind, type LookupTone } from "@/lib/grant-lookups";
import { db } from "@/server/db/client";

/**
 * Data access for grant categories and statuses. Callers must authorise first (see
 * LOOKUP_PERMISSIONS); this module only enforces data rules.
 */

export type LookupErrorCode = "NAME_TAKEN" | "NOT_FOUND" | "IN_USE" | "NOT_EMPTY";

export class LookupError extends Error {
  constructor(
    public readonly code: LookupErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "LookupError";
  }
}

const select = {
  id: true,
  name: true,
  description: true,
  tone: true,
  active: true,
  sortOrder: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.GrantCategorySelect & Prisma.GrantStatusSelect;

type Row = Prisma.GrantCategoryGetPayload<{ select: typeof select }>;
export type LookupItem = Omit<Row, "tone"> & { tone: LookupTone };

/**
 * The two models have identical columns, so one delegate type covers both. Prisma's
 * generated delegates aren't assignable to each other, hence the cast.
 */
type Delegate = Prisma.TransactionClient["grantCategory"];
function table(kind: LookupKind, client: Prisma.TransactionClient = db()): Delegate {
  return (kind === "category" ? client.grantCategory : client.grantStatus) as unknown as Delegate;
}

const toItem = (row: Row): LookupItem => ({ ...row, tone: isLookupTone(row.tone) ? row.tone : "neutral" });
const orderBy = [{ sortOrder: "asc" }, { name: "asc" }] satisfies Prisma.GrantCategoryOrderByWithRelationInput[];

export async function listLookups(kind: LookupKind, options: { activeOnly?: boolean } = {}): Promise<LookupItem[]> {
  const rows = await table(kind).findMany({ where: options.activeOnly ? { active: true } : {}, select, orderBy });
  return rows.map(toItem);
}

export async function getLookup(kind: LookupKind, id: string): Promise<LookupItem | null> {
  const row = await table(kind).findUnique({ where: { id }, select });
  return row && toItem(row);
}

function translate(kind: LookupKind, error: unknown): never {
  const { singular } = LOOKUP_CONFIG[kind];
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === "P2002") throw new LookupError("NAME_TAKEN", `There is already a ${singular} with this name.`);
    if (error.code === "P2025") throw new LookupError("NOT_FOUND", `That ${singular} no longer exists.`);
    // Foreign key violation: records still refer to it.
    if (error.code === "P2003") {
      throw new LookupError("IN_USE", `This ${singular} is in use, so it can't be deleted. Deactivate it instead.`);
    }
  }
  throw error;
}

/** Adds an entry at the end of the list. */
export async function createLookup(kind: LookupKind, input: LookupInput): Promise<{ id: string }> {
  try {
    return await db().$transaction(async (tx) => {
      const last = await table(kind, tx).aggregate({ _max: { sortOrder: true } });
      return table(kind, tx).create({ data: { ...input, sortOrder: (last._max.sortOrder ?? 0) + 1 }, select: { id: true } });
    });
  } catch (error) {
    translate(kind, error);
  }
}

export async function updateLookup(kind: LookupKind, id: string, input: LookupInput): Promise<void> {
  try {
    await table(kind).update({ where: { id }, data: input, select: { id: true } });
  } catch (error) {
    translate(kind, error);
  }
}

export async function deleteLookup(kind: LookupKind, id: string): Promise<void> {
  try {
    await table(kind).delete({ where: { id }, select: { id: true } });
  } catch (error) {
    translate(kind, error);
  }
}

/**
 * Moves an entry one place up or down. The list is renumbered 1…n in the same
 * transaction, so gaps or ties left by deletes and concurrent adds don't matter.
 * Moving past either end does nothing.
 */
export async function moveLookup(kind: LookupKind, id: string, direction: "up" | "down"): Promise<void> {
  await db().$transaction(async (tx) => {
    const ids = (await table(kind, tx).findMany({ select: { id: true }, orderBy })).map((r) => r.id);
    const from = ids.indexOf(id);
    if (from === -1) throw new LookupError("NOT_FOUND", `That ${LOOKUP_CONFIG[kind].singular} no longer exists.`);
    const to = direction === "up" ? from - 1 : from + 1;
    if (to < 0 || to >= ids.length) return;
    [ids[from], ids[to]] = [ids[to], ids[from]];
    for (const [i, rowId] of ids.entries()) {
      await table(kind, tx).update({ where: { id: rowId }, data: { sortOrder: i + 1 } });
    }
  });
}

/** Adds STANDARD_GRANT_STATUSES. Only allowed while the status list is empty. */
export async function addStandardStatuses(): Promise<number> {
  return db().$transaction(async (tx) => {
    if ((await tx.grantStatus.count()) > 0) {
      throw new LookupError("NOT_EMPTY", "Standard statuses can only be added while the list is empty.");
    }
    const { count } = await tx.grantStatus.createMany({
      data: STANDARD_GRANT_STATUSES.map((s, i) => ({ ...s, active: true, sortOrder: i + 1 })),
    });
    return count;
  });
}
