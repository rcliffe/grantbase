import "server-only";
import { Prisma } from "@/generated/prisma/client";
import { CHARITY_PAGE_SIZE, type CharityInput } from "@/lib/charities";
import { db } from "@/server/db/client";

/**
 * Charity data-access layer. Callers must authorise first (see server/authz and
 * CHARITY_PERMISSIONS); this module only enforces data rules.
 */

export type CharityErrorCode = "REGISTRATION_NUMBER_TAKEN" | "NOT_FOUND";

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
  addressLine1: true,
  addressLine2: true,
  town: true,
  county: true,
  postcode: true,
  country: true,
  contactEmail: true,
  website: true,
  createdAt: true,
  updatedAt: true,
  createdBy: { select: { name: true } },
  updatedBy: { select: { name: true } },
} satisfies Prisma.CharitySelect;

export type CharityDetail = Prisma.CharityGetPayload<{ select: typeof detailSelect }>;

export async function listCharities(options: { query?: string; page?: number } = {}): Promise<{
  items: CharityListItem[];
  total: number;
  page: number;
  pageCount: number;
}> {
  const query = options.query?.trim().slice(0, 100) ?? "";
  // Prisma's `contains` passes LIKE wildcards through, so escape them to search literally.
  const escapeLike = (s: string) => s.replace(/[\\%_]/g, "\\$&");
  // Case-insensitive via the utf8mb4_unicode_ci collation.
  const where: Prisma.CharityWhereInput = query
    ? {
        OR: [
          { name: { contains: escapeLike(query) } },
          { registrationNumber: { contains: escapeLike(query.replace(/\s+/g, "")) } },
          { town: { contains: escapeLike(query) } },
          { postcode: { contains: escapeLike(query) } },
        ],
      }
    : {};

  const total = await db().charity.count({ where });
  const pageCount = Math.max(1, Math.ceil(total / CHARITY_PAGE_SIZE));
  const page = Math.min(Math.max(1, Math.floor(options.page ?? 1)), pageCount);
  const items = await db().charity.findMany({
    where,
    select: listSelect,
    orderBy: [{ name: "asc" }, { id: "asc" }],
    skip: (page - 1) * CHARITY_PAGE_SIZE,
    take: CHARITY_PAGE_SIZE,
  });
  return { items, total, page, pageCount };
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
