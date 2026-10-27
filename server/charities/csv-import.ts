import "server-only";
import { Prisma } from "@/generated/prisma/client";
import { CHARITY_FIELDS, charitySchema, normaliseRegistrationNumber, type CharityInput } from "@/lib/charities";
import { CHARITY_CSV_COLUMNS, charityColumnForHeader, charityToValues, type CharityCsvColumn } from "@/lib/charity-csv";
import { emptyImportSummary, importSummary, parseCsvWithHeader, type ImportRowError, type ImportSummary } from "@/lib/csv-import";
import { db } from "@/server/db/client";

/**
 * CSV import for charities. Rows with an ID update that charity; rows without one
 * update the charity with the same registration number, or else create a new one.
 * Columns left out of the file keep their current values. The whole file is checked
 * first and then saved in one transaction, so it is imported completely or not at all.
 */

const LABELS = Object.fromEntries(CHARITY_CSV_COLUMNS.flatMap((c) => (c.field ? [[c.field, c.header]] : []))) as Record<string, string>;

const existingSelect = {
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
} satisfies Prisma.CharitySelect & Record<(typeof CHARITY_FIELDS)[number], true>;
type Existing = Prisma.CharityGetPayload<{ select: typeof existingSelect }>;

type PlannedRow = { row: number; targetId: string | null; data: CharityInput; changed: boolean };

export async function importCharitiesCsv(text: string, actorId: string, options: { commit: boolean }): Promise<ImportSummary> {
  const parsedCsv = parseCsvWithHeader<Exclude<CharityCsvColumn, "ignored">>(text, {
    lookup: charityColumnForHeader,
    required: [{ column: "name", header: "Name" }],
  });
  if (!parsedCsv.ok) return emptyImportSummary(parsedCsv.fileErrors);
  const { columns, rows: parsedRows } = parsedCsv;

  // ---- Existing charities the file refers to, by ID and by registration number ----
  const ids = [...new Set(parsedRows.map((r) => r.values.id?.trim()).filter((v): v is string => Boolean(v)))];
  const regNumbers = [
    ...new Set(parsedRows.map((r) => normaliseRegistrationNumber(r.values.registrationNumber ?? "")).filter(Boolean)),
  ];
  const existing = await db().charity.findMany({
    where: { OR: [{ id: { in: ids } }, { registrationNumber: { in: regNumbers } }] },
    select: existingSelect,
  });
  const byId = new Map(existing.map((c) => [c.id, c]));
  const byRegNumber = new Map(existing.filter((c) => c.registrationNumber).map((c) => [c.registrationNumber!, c]));

  // ---- Validate and plan every row ----
  const rowErrors: ImportRowError[] = [];
  const planned: PlannedRow[] = [];
  const targetRows = new Map<string, number>();
  for (const { row, values, tooManyCells, cellCount } of parsedRows) {
    const fail = (message: string) => rowErrors.push({ row, message });
    if (tooManyCells) {
      fail(`Has ${cellCount} values but the header has ${columns.length} columns.`);
      continue;
    }

    const id = values.id?.trim() ?? "";
    let target: Existing | undefined;
    if (id) {
      target = byId.get(id);
      if (!target) {
        fail(`No charity has the ID “${id}”. Clear the ID to add it as a new charity.`);
        continue;
      }
    } else if (values.registrationNumber) {
      target = byRegNumber.get(normaliseRegistrationNumber(values.registrationNumber));
    }
    if (target) {
      const earlier = targetRows.get(target.id);
      if (earlier) {
        fail(`Updates the same charity as row ${earlier} (${target.name}).`);
        continue;
      }
      targetRows.set(target.id, row);
    }

    const base = target ? charityToValues(target) : {};
    const input = { ...Object.fromEntries(CHARITY_FIELDS.map((f) => [f, ""])), ...base, ...values };
    const parsed = charitySchema.safeParse(input);
    if (!parsed.success) {
      fail(parsed.error.issues.map((issue) => `${LABELS[String(issue.path[0])] ?? "Value"}: ${issue.message}`).join(" "));
      continue;
    }
    const changed = !target || CHARITY_FIELDS.some((f) => parsed.data[f] !== target[f]);
    planned.push({ row, targetId: target?.id ?? null, data: parsed.data, changed });
  }

  // ---- Registration numbers must stay unique, within the file and against the database ----
  const finalRegNumbers = [...new Set(planned.map((p) => p.data.registrationNumber).filter((v): v is string => Boolean(v)))];
  const owners = new Map(
    (
      await db().charity.findMany({
        where: { registrationNumber: { in: finalRegNumbers } },
        select: { id: true, name: true, registrationNumber: true },
      })
    ).map((c) => [c.registrationNumber!, c]),
  );
  const claimedBy = new Map<string, number>();
  const valid = planned.filter((p) => {
    const reg = p.data.registrationNumber;
    if (!reg) return true;
    const earlier = claimedBy.get(reg);
    if (earlier) {
      rowErrors.push({ row: p.row, message: `Registration number ${reg} is also used in row ${earlier}.` });
      return false;
    }
    claimedBy.set(reg, p.row);
    const owner = owners.get(reg);
    if (owner && owner.id !== p.targetId) {
      rowErrors.push({ row: p.row, message: `Registration number ${reg} already belongs to ${owner.name}.` });
      return false;
    }
    return true;
  });

  const creates = valid.filter((p) => !p.targetId);
  const updates = valid.filter((p) => p.targetId && p.changed);
  const summary = importSummary(
    { created: creates.length, updated: updates.length, unchanged: valid.length - creates.length - updates.length },
    rowErrors,
  );
  if (rowErrors.length || !options.commit) return summary;

  // ---- Save ----
  try {
    await db().$transaction(
      async (tx) => {
        if (creates.length) {
          await tx.charity.createMany({ data: creates.map((p) => ({ ...p.data, createdById: actorId, updatedById: actorId })) });
        }
        for (const p of updates) {
          await tx.charity.update({ where: { id: p.targetId! }, data: { ...p.data, updatedById: actorId } });
        }
      },
      { timeout: 120_000 },
    );
  } catch (error) {
    // A concurrent edit can still collide on the unique index or delete a target row.
    if (error instanceof Prisma.PrismaClientKnownRequestError && (error.code === "P2002" || error.code === "P2025")) {
      return emptyImportSummary(["Charities changed while the file was being imported. Nothing was saved; check the file again."]);
    }
    throw error;
  }
  return { ...summary, saved: true };
}
