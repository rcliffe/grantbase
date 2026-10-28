import "server-only";
import { Prisma } from "@/generated/prisma/client";
import { type CharityInput } from "@/lib/charities";
import { clampPage, pageSize, type PageSize } from "@/lib/pagination";
import { db } from "@/server/db/client";

/**
 * Charity data-access layer. Callers must authorise first (see server/authz and
 * CHARITY_PERMISSIONS); this module only enforces data rules.
 */

export type CharityErrorCode = "REGISTRATION_NUMBER_TAKEN" | "NOT_FOUND" | "HAS_GRANTS";

export class CharityError extends Error {
  constructor(
    public readonly code: CharityErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "CharityError";
  }
}

const listSelect = {
  id: true,
  name: true,
  registrationNumber: true,
  town: true,
  postcode: true,
  contactEmail: true,
  website: true,
} satisfies Prisma.CharitySelect;

export type CharityListItem = Prisma.CharityGetPayload<{ select: typeof listSelect }>;

const detailSelect = {
  id: true,
  name: true,
  registrationNumber: true,
  yearEstablished: true,
  description: true,
  addressLine1: true,
  addressLine2: true,
  town: true,
  county: true,
  postcode: true,
  country: true,
  contactName: true,
  contactPosition: true,
  contactEmail: true,
  website: true,
  createdAt: true,
  updatedAt: true,
  createdBy: { select: { name: true } },
  updatedBy: { select: { name: true } },
} satisfies Prisma.CharitySelect;

export type CharityDetail = Prisma.CharityGetPayload<{ select: typeof detailSelect }>;

/** Search across name, registration number, town and postcode. */
function searchWhere(rawQuery: string | undefined): Prisma.CharityWhereInput {
  const query = rawQuery?.trim().slice(0, 100) ?? "";
  // Prisma's `contains` passes LIKE wildcards through, so escape them to search literally.
  const escapeLike = (s: string) => s.replace(/[\\%_]/g, "\\$&");
  // Case-insensitive via the utf8mb4_unicode_ci collation.
  return query
    ? {
        OR: [
          { name: { contains: escapeLike(query) } },
          { registrationNumber: { contains: escapeLike(query.replace(/\s+/g, "")) } },
          { town: { contains: escapeLike(query) } },
          { postcode: { contains: escapeLike(query) } },
        ],
      }
    : {};
}

export async function listCharities(options: { query?: string; page?: number; pageSize?: number } = {}): Promise<{
  items: CharityListItem[];
  total: number;
  page: number;
  pageCount: number;
  pageSize: PageSize;
}> {
  const where = searchWhere(options.query);
  const total = await db().charity.count({ where });
  const size = pageSize(options.pageSize);
  const { page, pageCount, skip } = clampPage(options.page, total, size);
  const items = await db().charity.findMany({
    where,
    select: listSelect,
    orderBy: [{ name: "asc" }, { id: "asc" }],
    skip,
    take: size,
  });
  return { items, total, page, pageCount, pageSize: size };
}

const exportSelect = {
  id: true,
  name: true,
  registrationNumber: true,
  yearEstablished: true,
  description: true,
  addressLine1: true,
  addressLine2: true,
  town: true,
  county: true,
  postcode: true,
  country: true,
  contactName: true,
  contactPosition: true,
  contactEmail: true,
  website: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.CharitySelect;

export type CharityExportRow = Prisma.CharityGetPayload<{ select: typeof exportSelect }>;

/** Every charity matching the list search (all of them when `query` is blank), for CSV export. */
export async function exportCharities(query?: string): Promise<CharityExportRow[]> {
  return db().charity.findMany({ where: searchWhere(query), select: exportSelect, orderBy: [{ name: "asc" }, { id: "asc" }] });
}

export async function getCharity(id: string): Promise<CharityDetail | null> {
  return db().charity.findUnique({ where: { id }, select: detailSelect });
}

function translate(error: unknown): never {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === "P2002") {
      throw new CharityError("REGISTRATION_NUMBER_TAKEN", "Another charity already has this registration number.");
    }
    if (error.code === "P2025") throw new CharityError("NOT_FOUND", "Charity not found.");
    // Foreign key violation: grants still refer to the charity.
    if (error.code === "P2003") {
      throw new CharityError("HAS_GRANTS", "This charity has grants, so it can't be deleted. Delete its grants first.");
    }
  }
  throw error;
}

export async function createCharity(input: CharityInput, actorId: string): Promise<{ id: string }> {
  try {
    return await db().charity.create({
      data: { ...input, createdById: actorId, updatedById: actorId },
      select: { id: true },
    });
  } catch (error) {
    translate(error);
  }
}

export async function updateCharity(id: string, input: CharityInput, actorId: string): Promise<{ id: string }> {
  try {
    return await db().charity.update({
      where: { id },
      data: { ...input, updatedById: actorId },
      select: { id: true },
    });
  } catch (error) {
    translate(error);
  }
}

export async function deleteCharity(id: string): Promise<void> {
  try {
    await db().charity.delete({ where: { id } });
  } catch (error) {
    translate(error);
  }
}
