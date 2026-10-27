import "server-only";
import { Prisma } from "@/generated/prisma/client";
import { normaliseRegistrationNumber } from "@/lib/charities";
import { emptyImportSummary, importSummary, nameKey, parseCsvWithHeader, type ImportRowError, type ImportSummary } from "@/lib/csv-import";
import { GRANT_CSV_LABELS, grantColumnForHeader, normaliseImportDate, type GrantCsvColumn } from "@/lib/grant-csv";
import { GRANT_FIELDS, grantData, grantSchema, grantToValues, type GrantInput } from "@/lib/grants";
import { db } from "@/server/db/client";

/**
 * CSV import for grants. Rows with an ID update that grant; rows without one create
 * a grant. The charity is found by Charity ID, else registration number, else name;
 * category and status by name. Columns left out of the file keep their current
 * values. The whole file is checked first and then saved in one transaction, so it
 * is imported completely or not at all.
 */

type Field = (typeof GRANT_FIELDS)[number];
type Values = Record<Field, string>;

const FIELD_LABELS: Record<Field, string> = {
  charityId: "Charity",
  categoryId: "Category",
  statusId: "Status",
  purpose: GRANT_CSV_LABELS.purpose,
  dateSubmitted: GRANT_CSV_LABELS.dateSubmitted,
  amountRequested: GRANT_CSV_LABELS.amountRequested,
  amountAgreed: GRANT_CSV_LABELS.amountAgreed,
  decisionDate: GRANT_CSV_LABELS.decisionDate,
  paymentDate: GRANT_CSV_LABELS.paymentDate,
  accountsDate: GRANT_CSV_LABELS.accountsDate,
  income: GRANT_CSV_LABELS.income,
  expenditure: GRANT_CSV_LABELS.expenditure,
  governmentFunding: GRANT_CSV_LABELS.governmentFunding,
  otherFunders: GRANT_CSV_LABELS.otherFunders,
  penceInPound: GRANT_CSV_LABELS.penceInPound,
  employees: GRANT_CSV_LABELS.employees,
  volunteers: GRANT_CSV_LABELS.volunteers,
  trustees: GRANT_CSV_LABELS.trustees,
};

/** Columns copied straight into the form values (dates normalised). */
const PLAIN_COLUMNS = [
  "purpose",
  "dateSubmitted",
  "amountRequested",
  "amountAgreed",
  "decisionDate",
  "paymentDate",
  "accountsDate",
  "income",
  "expenditure",
  "governmentFunding",
  "otherFunders",
  "penceInPound",
  "employees",
  "volunteers",
  "trustees",
] as const satisfies readonly Exclude<Field, "charityId" | "categoryId" | "statusId">[];
const DATE_COLUMNS = new Set<string>(["dateSubmitted", "decisionDate", "paymentDate", "accountsDate"]);

const existingSelect = {
  id: true,
  charityId: true,
  categoryId: true,
  statusId: true,
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
} satisfies Prisma.GrantSelect & Record<Field, true>;
type Existing = Prisma.GrantGetPayload<{ select: typeof existingSelect }>;

/** Same values after validation, for spotting unchanged rows. */
const sameAs = (data: GrantInput, before: Values) => GRANT_FIELDS.every((f) => String(data[f] ?? "") === before[f]);

type PlannedRow = { row: number; targetId: string | null; data: GrantInput; changed: boolean };

export async function importGrantsCsv(text: string, actorId: string, options: { commit: boolean }): Promise<ImportSummary> {
  const parsedCsv = parseCsvWithHeader<GrantCsvColumn>(text, { lookup: grantColumnForHeader, required: [] });
  if (!parsedCsv.ok) return emptyImportSummary(parsedCsv.fileErrors);
  const { columns, rows } = parsedCsv;
  const has = (c: GrantCsvColumn) => columns.includes(c);
  if (!has("id") && !(has("charityId") || has("charityRegistrationNumber") || has("charityName"))) {
    return emptyImportSummary(["The file needs an “ID” column to update grants, or a “Charity” column to add them."]);
  }

  // ---- Everything the file refers to ----
  const distinct = (pick: (v: Partial<Record<GrantCsvColumn, string>>) => string | undefined) => [
    ...new Set(rows.map((r) => pick(r.values)?.trim()).filter((v): v is string => Boolean(v))),
  ];
  const ids = distinct((v) => v.id);
  const charityIds = distinct((v) => v.charityId);
  const regNumbers = distinct((v) => (v.charityRegistrationNumber ? normaliseRegistrationNumber(v.charityRegistrationNumber) : ""));
  const charityNames = distinct((v) => v.charityName);

  const [existing, charities, categories, statuses] = await Promise.all([
    db().grant.findMany({ where: { id: { in: ids } }, select: existingSelect }),
    db().charity.findMany({
      where: { OR: [{ id: { in: charityIds } }, { registrationNumber: { in: regNumbers } }, { name: { in: charityNames } }] },
      select: { id: true, name: true, registrationNumber: true },
    }),
    db().grantCategory.findMany({ select: { id: true, name: true, active: true } }),
    db().grantStatus.findMany({ select: { id: true, name: true, active: true } }),
  ]);
  const grantsById = new Map(existing.map((g) => [g.id, g]));
  const charityById = new Map(charities.map((c) => [c.id, c]));
  const charityByReg = new Map(charities.filter((c) => c.registrationNumber).map((c) => [c.registrationNumber!, c]));
  const charitiesByName = new Map<string, typeof charities>();
  for (const c of charities) charitiesByName.set(nameKey(c.name), [...(charitiesByName.get(nameKey(c.name)) ?? []), c]);
  const categoryByName = new Map(categories.map((c) => [nameKey(c.name), c]));
  const statusByName = new Map(statuses.map((s) => [nameKey(s.name), s]));
  const categoryById = new Map(categories.map((c) => [c.id, c]));
  const statusById = new Map(statuses.map((s) => [s.id, s]));

  /** The charity a row names, undefined when it names none, or an error message. */
  function resolveCharity(v: Partial<Record<GrantCsvColumn, string>>): { id: string } | { error: string } | undefined {
    const id = v.charityId?.trim();
    if (id) return charityById.has(id) ? { id } : { error: `No charity has the ID “${id}”.` };
    const reg = v.charityRegistrationNumber ? normaliseRegistrationNumber(v.charityRegistrationNumber) : "";
    if (reg) {
      const c = charityByReg.get(reg);
      return c ? { id: c.id } : { error: `No charity has the registration number ${reg}.` };
    }
    const name = v.charityName?.trim();
    if (name) {
      const matches = charitiesByName.get(nameKey(name)) ?? [];
      if (matches.length === 1) return { id: matches[0].id };
      return matches.length === 0
        ? { error: `No charity is called “${name}”.` }
        : { error: `${matches.length} charities are called “${name}”. Add the charity's registration number or Charity ID.` };
    }
    return undefined;
  }

  // ---- Validate and plan every row ----
  const rowErrors: ImportRowError[] = [];
  const planned: PlannedRow[] = [];
  const targetRows = new Map<string, number>();
  for (const { row, values: v, tooManyCells, cellCount } of rows) {
    const errors: string[] = [];
    if (tooManyCells) {
      rowErrors.push({ row, message: `Has ${cellCount} values but the header has ${columns.length} columns.` });
      continue;
    }

    const id = v.id?.trim() ?? "";
    let target: Existing | undefined;
    if (id) {
      target = grantsById.get(id);
      if (!target) {
        rowErrors.push({ row, message: `No grant has the ID “${id}”. Clear the ID to add it as a new grant.` });
        continue;
      }
      const earlier = targetRows.get(id);
      if (earlier) {
        rowErrors.push({ row, message: `Updates the same grant as row ${earlier}.` });
        continue;
      }
      targetRows.set(id, row);
    }

    const values: Values = target ? grantToValues(target) : (Object.fromEntries(GRANT_FIELDS.map((f) => [f, ""])) as Values);

    const charity = resolveCharity(v);
    if (charity && "error" in charity) errors.push(`Charity: ${charity.error}`);
    else if (charity) values.charityId = charity.id;
    else if (!target) errors.push("Charity: enter the charity's name, registration number or Charity ID.");

    for (const [column, field, byName, noun] of [
      ["category", "categoryId", categoryByName, "category"],
      ["status", "statusId", statusByName, "status"],
    ] as const) {
      if (v[column] === undefined) continue; // column not in the file: keep
      const name = v[column].trim();
      const match = name ? byName.get(nameKey(name)) : undefined;
      if (!name) values[field] = "";
      else if (!match) errors.push(`${FIELD_LABELS[field]}: no ${noun} is called “${name}”.`);
      else values[field] = match.id;
    }

    for (const column of PLAIN_COLUMNS) {
      const value = v[column];
      if (value !== undefined) values[column] = DATE_COLUMNS.has(column) ? normaliseImportDate(value) : value;
    }

    const parsed = grantSchema.safeParse(values);
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        const field = String(issue.path[0]) as Field;
        // Charity/category/status problems are already reported above in import terms.
        if (errors.some((e) => e.startsWith(`${FIELD_LABELS[field]}:`))) continue;
        errors.push(`${FIELD_LABELS[field] ?? "Value"}: ${issue.message}`);
      }
    } else {
      // New grants, or a change of category/status, must use active entries.
      const category = categoryById.get(parsed.data.categoryId);
      const status = statusById.get(parsed.data.statusId);
      if (category && !category.active && parsed.data.categoryId !== target?.categoryId) {
        errors.push(`Category: “${category.name}” is inactive.`);
      }
      if (status && !status.active && parsed.data.statusId !== target?.statusId) {
        errors.push(`Status: “${status.name}” is inactive.`);
      }
    }

    if (errors.length || !parsed.success) {
      rowErrors.push({ row, message: errors.join(" ") });
      continue;
    }
    planned.push({ row, targetId: target?.id ?? null, data: parsed.data, changed: !target || !sameAs(parsed.data, grantToValues(target)) });
  }

  const creates = planned.filter((p) => !p.targetId);
  const updates = planned.filter((p) => p.targetId && p.changed);
  const summary = importSummary(
    { created: creates.length, updated: updates.length, unchanged: planned.length - creates.length - updates.length },
    rowErrors,
  );
  if (rowErrors.length || !options.commit) return summary;

  // ---- Save ----
  try {
    await db().$transaction(
      async (tx) => {
        if (creates.length) {
          await tx.grant.createMany({ data: creates.map((p) => ({ ...grantData(p.data), createdById: actorId, updatedById: actorId })) });
        }
        for (const p of updates) {
          await tx.grant.update({ where: { id: p.targetId! }, data: { ...grantData(p.data), updatedById: actorId } });
        }
      },
      { timeout: 120_000 },
    );
  } catch (error) {
    // A charity, category, status or grant was deleted while the file was being imported.
    if (error instanceof Prisma.PrismaClientKnownRequestError && (error.code === "P2003" || error.code === "P2025")) {
      return emptyImportSummary(["Records changed while the file was being imported. Nothing was saved; check the file again."]);
    }
    throw error;
  }
  return { ...summary, saved: true };
}
