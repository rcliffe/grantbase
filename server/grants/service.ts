import "server-only";
import { Prisma } from "@/generated/prisma/client";
import { isLookupTone, type LookupTone } from "@/lib/grant-lookups";
import { grantData, type GrantInput } from "@/lib/grants";
import { clampPage, pageSize, type PageSize } from "@/lib/pagination";
import { db } from "@/server/db/client";

/**
 * Grant data-access layer. Callers must authorise first (see GRANT_PERMISSIONS);
 * this module only enforces data rules. Amounts leave this module as decimal strings
 * ("2500.00") so they can be passed to Client Components without rounding.
 */

export type GrantErrorCode = "NOT_FOUND" | "CHARITY_NOT_FOUND" | "INVALID_CATEGORY" | "INVALID_STATUS";

export class GrantError extends Error {
  constructor(
    public readonly code: GrantErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "GrantError";
  }
}

const lookupSelect = { id: true, name: true, tone: true, active: true } satisfies Prisma.GrantStatusSelect;
type LookupRow = Prisma.GrantStatusGetPayload<{ select: typeof lookupSelect }>;
export type GrantLookupRef = Omit<LookupRow, "tone"> & { tone: LookupTone };

const grantSelect = {
  id: true,
  purpose: true,
  dateSubmitted: true,
  amountRequested: true,
  amountAgreed: true,
  decisionDate: true,
  paymentDate: true,
  accountsDate: true,
  income: true,
  expenditure: true,
  governmentFunding: true,
  otherFunders: true,
  penceInPound: true,
  employees: true,
  volunteers: true,
  trustees: true,
  submissionReference: true,
  createdAt: true,
  updatedAt: true,
  charity: { select: { id: true, name: true, registrationNumber: true } },
  category: { select: lookupSelect },
  status: { select: lookupSelect },
  createdBy: { select: { name: true } },
  updatedBy: { select: { name: true } },
} satisfies Prisma.GrantSelect;

type GrantRow = Prisma.GrantGetPayload<{ select: typeof grantSelect }>;

type AmountField = "amountRequested" | "amountAgreed" | "income" | "expenditure" | "governmentFunding";

export type GrantItem = Omit<GrantRow, AmountField | "category" | "status"> & {
  amountRequested: string;
  amountAgreed: string | null;
  income: string | null;
  expenditure: string | null;
  governmentFunding: string | null;
  category: GrantLookupRef;
  status: GrantLookupRef;
};

const toRef = (row: LookupRow): GrantLookupRef => ({ ...row, tone: isLookupTone(row.tone) ? row.tone : "neutral" });
const toItem = (row: GrantRow): GrantItem => ({
  ...row,
  amountRequested: row.amountRequested.toFixed(2),
  amountAgreed: row.amountAgreed?.toFixed(2) ?? null,
  income: row.income?.toFixed(2) ?? null,
  expenditure: row.expenditure?.toFixed(2) ?? null,
  governmentFunding: row.governmentFunding?.toFixed(2) ?? null,
  category: toRef(row.category),
  status: toRef(row.status),
});

const orderBy = [{ dateSubmitted: "desc" }, { createdAt: "desc" }, { id: "asc" }] satisfies Prisma.GrantOrderByWithRelationInput[];

export type GrantFilters = { query?: string; statusId?: string; categoryId?: string; charityId?: string };

function filterWhere(filters: GrantFilters): Prisma.GrantWhereInput {
  const query = filters.query?.trim().slice(0, 100) ?? "";
  // Prisma's `contains` passes LIKE wildcards through, so escape them to search literally.
  const like = query.replace(/[\\%_]/g, "\\$&");
  return {
    ...(filters.statusId ? { statusId: filters.statusId } : {}),
    ...(filters.categoryId ? { categoryId: filters.categoryId } : {}),
    ...(filters.charityId ? { charityId: filters.charityId } : {}),
    ...(query
      ? {
          OR: [
            { charity: { name: { contains: like } } },
            { charity: { registrationNumber: { contains: like.replace(/\s+/g, "") } } },
            { purpose: { contains: like } },
          ],
        }
      : {}),
  };
}

export type GrantTotals = { count: number; requested: string; agreed: string };

export async function listGrants(filters: GrantFilters & { page?: number; pageSize?: number } = {}): Promise<{
  items: GrantItem[];
  totals: GrantTotals;
  page: number;
  pageCount: number;
  pageSize: PageSize;
}> {
  const where = filterWhere(filters);
  const agg = await db().grant.aggregate({ where, _count: { _all: true }, _sum: { amountRequested: true, amountAgreed: true } });
  const count = agg._count._all;
  const size = pageSize(filters.pageSize);
  const { page, pageCount, skip } = clampPage(filters.page, count, size);
  const rows = await db().grant.findMany({
    where,
    select: grantSelect,
    orderBy,
    skip,
    take: size,
  });
  return {
    items: rows.map(toItem),
    totals: {
      count,
      requested: agg._sum.amountRequested?.toFixed(2) ?? "0.00",
      agreed: agg._sum.amountAgreed?.toFixed(2) ?? "0.00",
    },
    page,
    pageCount,
    pageSize: size,
  };
}

/** Grants matching `where`, in `order` (newest first by default). For the process queues. */
export async function findGrants(
  where: Prisma.GrantWhereInput,
  order: Prisma.GrantOrderByWithRelationInput[] = orderBy,
): Promise<GrantItem[]> {
  return (await db().grant.findMany({ where, select: grantSelect, orderBy: order })).map(toItem);
}

/** Every grant matching the list filters, newest first, for CSV export. */
export async function exportGrants(filters: GrantFilters = {}): Promise<GrantItem[]> {
  return (await db().grant.findMany({ where: filterWhere(filters), select: grantSelect, orderBy })).map(toItem);
}

/** All grants for one charity, newest first. */
export async function listGrantsForCharity(charityId: string): Promise<GrantItem[]> {
  return (await db().grant.findMany({ where: { charityId }, select: grantSelect, orderBy })).map(toItem);
}

export async function getGrant(id: string): Promise<GrantItem | null> {
  const row = await db().grant.findUnique({ where: { id }, select: grantSelect });
  return row && toItem(row);
}

/**
 * Choices for the grant form: every charity, and the active categories and statuses
 * plus, when editing, the grant's current ones even if they have since been deactivated.
 */
export async function getGrantFormOptions(current?: { categoryId: string; statusId: string }) {
  const lookupWhere = (id?: string) => ({ OR: [{ active: true }, ...(id ? [{ id }] : [])] });
  const lookupOrder = [{ sortOrder: "asc" as const }, { name: "asc" as const }];
  const [charities, categories, statuses] = await Promise.all([
    db().charity.findMany({ select: { id: true, name: true, registrationNumber: true }, orderBy: [{ name: "asc" }, { id: "asc" }] }),
    db().grantCategory.findMany({ where: lookupWhere(current?.categoryId), select: lookupSelect, orderBy: lookupOrder }),
    db().grantStatus.findMany({ where: lookupWhere(current?.statusId), select: lookupSelect, orderBy: lookupOrder }),
  ]);
  return { charities, categories: categories.map(toRef), statuses: statuses.map(toRef) };
}

export type GrantFormOptions = Awaited<ReturnType<typeof getGrantFormOptions>>;

/**
 * The charity must exist, and the category and status must be active, unless they
 * are what the grant already had (an inactive entry can stay on an existing grant).
 */
async function checkReferences(input: GrantInput, existing?: { categoryId: string; statusId: string }) {
  const [charity, category, status] = await Promise.all([
    db().charity.findUnique({ where: { id: input.charityId }, select: { id: true } }),
    db().grantCategory.findUnique({ where: { id: input.categoryId }, select: { active: true } }),
    db().grantStatus.findUnique({ where: { id: input.statusId }, select: { active: true } }),
  ]);
  if (!charity) throw new GrantError("CHARITY_NOT_FOUND", "That charity no longer exists.");
  if (!category || (!category.active && input.categoryId !== existing?.categoryId)) {
    throw new GrantError("INVALID_CATEGORY", "Choose an active category.");
  }
  if (!status || (!status.active && input.statusId !== existing?.statusId)) {
    throw new GrantError("INVALID_STATUS", "Choose an active status.");
  }
}

function translate(error: unknown): never {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === "P2025") throw new GrantError("NOT_FOUND", "Grant not found.");
    // A referenced charity, category or status was deleted after the check above.
    if (error.code === "P2003") throw new GrantError("CHARITY_NOT_FOUND", "The charity, category or status no longer exists.");
  }
  throw error;
}

export async function createGrant(input: GrantInput, actorId: string): Promise<{ id: string }> {
  await checkReferences(input);
  try {
    return await db().grant.create({ data: { ...grantData(input), createdById: actorId, updatedById: actorId }, select: { id: true } });
  } catch (error) {
    translate(error);
  }
}

export async function updateGrant(id: string, input: GrantInput, actorId: string): Promise<{ id: string }> {
  const existing = await db().grant.findUnique({ where: { id }, select: { categoryId: true, statusId: true } });
  if (!existing) throw new GrantError("NOT_FOUND", "Grant not found.");
  await checkReferences(input, existing);
  try {
    return await db().grant.update({ where: { id }, data: { ...grantData(input), updatedById: actorId }, select: { id: true } });
  } catch (error) {
    translate(error);
  }
}

export async function deleteGrant(id: string): Promise<void> {
  try {
    await db().grant.delete({ where: { id } });
  } catch (error) {
    translate(error);
  }
}
