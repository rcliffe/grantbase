import "server-only";
import { Prisma } from "@/generated/prisma/client";
import { CHARITY_FIELDS, charitySchema, normaliseRegistrationNumber, type CharityInput } from "@/lib/charities";
import { emptyImportSummary, importSummary, nameKey, parseCsvWithHeader, type ImportRowError, type ImportSummary } from "@/lib/csv-import";
import { GRANT_STAGE_LABELS } from "@/lib/grant-process";
import { GRANT_FIELDS, grantData, grantSchema, type GrantInput } from "@/lib/grants";
import {
  normaliseSubmissionDate,
  optionalAnswer,
  parseAddress,
  submissionColumnForHeader,
  type SubmissionColumn,
} from "@/lib/submissions-csv";
import { db } from "@/server/db/client";

/**
 * Import of an online application form's submissions report. Each row is one
 * application: its charity is matched by registration number, or else by name, and
 * added when there is no match; an existing charity only has its blank details
 * filled in, except its contact, which the newest submission replaces. Each row then
 * adds a grant. Rows whose Random ID was imported before are
 * skipped, so a growing report can be imported again, as are rows for a charity that
 * already has an application on the same day. The whole file is checked first
 * and then saved in one transaction, so it is imported completely or not at all.
 */

type CharityField = (typeof CHARITY_FIELDS)[number];
type GrantField = (typeof GRANT_FIELDS)[number];
type Values = Partial<Record<SubmissionColumn, string>>;

const CHARITY_LABELS: Record<CharityField, string> = {
  name: "Charity name",
  registrationNumber: "Registration number",
  yearEstablished: "Year established",
  description: "Description of organisation",
  addressLine1: "Address",
  addressLine2: "Address",
  town: "Address",
  county: "Address",
  postcode: "Address",
  country: "Address",
  contactName: "Name",
  contactPosition: "Position",
  contactEmail: "Email",
  website: "Website",
};

const GRANT_LABELS: Record<GrantField, string> = {
  charityId: "Charity name",
  categoryId: "Category",
  statusId: "Status",
  purpose: "Description of application",
  dateSubmitted: "Added time",
  amountRequested: "Grant request amount",
  amountAgreed: "Recommended/approved amount",
  decisionDate: "Date discussed",
  paymentDate: "Payment date",
  accountsDate: "Date of latest audited accounts",
  income: "Income",
  expenditure: "Expenditure",
  governmentFunding: "Government funding",
  otherFunders: "Other funders",
  penceInPound: "Pence in the pound",
  employees: "Employees",
  volunteers: "Volunteers",
  trustees: "Trustees",
};

/** Replaced together from the newest submission, so a new contact never keeps the old one's position. */
const CONTACT_FIELDS = ["contactName", "contactPosition", "contactEmail"] as const satisfies readonly CharityField[];
const isContactField = (f: CharityField) => (CONTACT_FIELDS as readonly string[]).includes(f);

/** Grant columns copied from the file (dates normalised). */
const GRANT_COLUMNS = [
  "purpose",
  "dateSubmitted",
  "amountRequested",
  "amountAgreed",
  "decisionDate",
  "accountsDate",
  "income",
  "expenditure",
  "governmentFunding",
  "otherFunders",
  "penceInPound",
  "employees",
  "volunteers",
  "trustees",
] as const satisfies readonly (SubmissionColumn & GrantField)[];
const DATE_COLUMNS = new Set<string>(["dateSubmitted", "decisionDate", "accountsDate"]);

const REFERENCE_MAX_LENGTH = 100;

const charitySelect = {
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
} satisfies Prisma.CharitySelect & Record<CharityField, true>;

/** A charity the file refers to: an existing one (`id` set) or one to add. */
type CharityPlan = {
  id: string | null;
  data: CharityInput;
  before: CharityInput | null;
  used: boolean;
  /** Days (YYYY-MM-DD) it has an application on, recorded or added by this file. */
  days: Set<string>;
  /** Its latest application's day, recorded or added by this file. */
  latest: string | null;
};

type PlannedGrant = { row: number; charity: CharityPlan; data: GrantInput; reference: string | null };

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** The charity's details from a row, as the charity form would submit them. */
function charityValues(v: Values): Record<CharityField, string> {
  const address = parseAddress(optionalAnswer(v.address));
  return {
    name: v.charityName ?? "",
    registrationNumber: optionalAnswer(v.registrationNumber),
    yearEstablished: optionalAnswer(v.yearEstablished),
    description: optionalAnswer(v.description),
    ...address,
    county: "",
    contactName: optionalAnswer(v.contactName),
    contactPosition: optionalAnswer(v.contactPosition),
    contactEmail: optionalAnswer(v.contactEmail),
    website: optionalAnswer(v.website),
  };
}

/** Fields of an existing charity the file changes: blanks filled in, or its contact replaced. */
const changedFields = (plan: CharityPlan) => CHARITY_FIELDS.filter((f) => plan.data[f] !== plan.before?.[f]);
const contactReplaced = (plan: CharityPlan) => CONTACT_FIELDS.some((f) => plan.before?.[f] != null && plan.data[f] !== plan.before[f]);

export async function importSubmissionsCsv(text: string, actorId: string, options: { commit: boolean }): Promise<ImportSummary> {
  const parsedCsv = parseCsvWithHeader<SubmissionColumn>(text, {
    // Unknown columns (questions added to the form later) are listed, not rejected.
    lookup: (header) => submissionColumnForHeader(header) ?? "ignored",
    required: [
      { column: "charityName", header: "Name of Charity/Organisation" },
      { column: "category", header: "Select the category which best describes the work of your organisation" },
      { column: "amountRequested", header: "Grant Request Amount (£)" },
      { column: "dateSubmitted", header: "Added Time" },
    ],
  });
  if (!parsedCsv.ok) return emptyImportSummary(parsedCsv.fileErrors);
  const { header, columns, rows } = parsedCsv;
  const unknownColumns = header.filter((h) => h.trim() && !submissionColumnForHeader(h));

  // ---- Everything the file refers to ----
  const distinct = (pick: (v: Values) => string) => [...new Set(rows.map((r) => pick(r.values)).filter(Boolean))];
  const references = distinct((v) => v.reference?.trim() ?? "");
  const regNumbers = distinct((v) => normaliseRegistrationNumber(optionalAnswer(v.registrationNumber)));
  const names = distinct((v) => v.charityName?.trim() ?? "");
  const days = distinct((v) => normaliseSubmissionDate(optionalAnswer(v.dateSubmitted)))
    .filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d))
    .map((d) => new Date(`${d}T00:00:00Z`));

  const lookupOrder = [{ sortOrder: "asc" as const }, { name: "asc" as const }];
  const charityWhere = { OR: [{ registrationNumber: { in: regNumbers } }, { name: { in: names } }] } satisfies Prisma.CharityWhereInput;
  const [imported, charities, applications, latestApplications, categories, statuses] = await Promise.all([
    db().grant.findMany({ where: { submissionReference: { in: references } }, select: { submissionReference: true } }),
    db().charity.findMany({ where: charityWhere, select: charitySelect }),
    db().grant.findMany({ where: { charity: charityWhere, dateSubmitted: { in: days } }, select: { charityId: true, dateSubmitted: true } }),
    db().grant.groupBy({ by: ["charityId"], where: { charity: charityWhere }, _max: { dateSubmitted: true } }),
    db().grantCategory.findMany({ select: { id: true, name: true, active: true }, orderBy: lookupOrder }),
    db().grantStatus.findMany({ select: { id: true, name: true, active: true, stage: true }, orderBy: lookupOrder }),
  ]);
  // References compare like the database collation (case-insensitively).
  const alreadyImported = new Set(imported.map((g) => nameKey(g.submissionReference!)));
  const categoryByName = new Map(categories.map((c) => [nameKey(c.name), c]));
  const statusByName = new Map(statuses.map((s) => [nameKey(s.name), s]));
  const defaultStatus = statuses.find((s) => s.active && s.stage === "SUBMITTED");

  // ---- Charities: the existing ones the file may refer to, plus those it adds ----
  const plans: CharityPlan[] = [];
  const planByReg = new Map<string, CharityPlan>();
  const plansByName = new Map<string, CharityPlan[]>();
  function addPlan(plan: CharityPlan) {
    plans.push(plan);
    if (plan.data.registrationNumber) planByReg.set(plan.data.registrationNumber, plan);
    const key = nameKey(plan.data.name);
    plansByName.set(key, [...(plansByName.get(key) ?? []), plan]);
  }
  const isoDay = (d: Date) => d.toISOString().slice(0, 10);
  const latestByCharity = new Map(latestApplications.map((g) => [g.charityId, g._max.dateSubmitted]));
  for (const { id, ...data } of charities) {
    const applied = applications.filter((g) => g.charityId === id).map((g) => isoDay(g.dateSubmitted));
    const latest = latestByCharity.get(id);
    addPlan({ id, data, before: data, used: false, days: new Set(applied), latest: latest ? isoDay(latest) : null });
  }

  /** The charity a row's details belong to, undefined for a new one, or an error message. */
  function matchCharity(data: CharityInput): CharityPlan | { error: string } | undefined {
    const reg = data.registrationNumber;
    if (reg && planByReg.has(reg)) return planByReg.get(reg);
    // By name, but never a charity with a different registration number.
    const candidates = (plansByName.get(nameKey(data.name)) ?? []).filter((p) => !reg || !p.data.registrationNumber);
    if (candidates.length > 1) {
      return { error: `${candidates.length} charities are called “${data.name}”. Add the registration number to say which one.` };
    }
    return candidates[0];
  }

  // ---- Validate and plan every row ----
  const rowErrors: ImportRowError[] = [];
  const planned: PlannedGrant[] = [];
  const referenceRows = new Map<string, number>();
  let skipped = 0;
  let sameDay = 0;
  for (const { row, values: v, tooManyCells, cellCount } of rows) {
    if (tooManyCells) {
      rowErrors.push({ row, message: `Has ${cellCount} values but the header has ${columns.length} columns.` });
      continue;
    }
    const errors: string[] = [];

    const reference = v.reference?.trim() ?? "";
    if (reference) {
      if (alreadyImported.has(nameKey(reference))) {
        skipped++;
        continue;
      }
      const earlier = referenceRows.get(nameKey(reference));
      if (earlier) {
        rowErrors.push({ row, message: `Has the same Random ID as row ${earlier}.` });
        continue;
      }
      referenceRows.set(nameKey(reference), row);
      if (reference.length > REFERENCE_MAX_LENGTH) errors.push(`Random ID: must be at most ${REFERENCE_MAX_LENGTH} characters.`);
    }

    const charity = charitySchema.safeParse(charityValues(v));
    if (!charity.success) {
      for (const issue of charity.error.issues) errors.push(`${CHARITY_LABELS[issue.path[0] as CharityField] ?? "Value"}: ${issue.message}`);
    }

    // The charity is resolved after validation; a placeholder ID satisfies the schema.
    const grant: Record<GrantField, string> = { ...(Object.fromEntries(GRANT_FIELDS.map((f) => [f, ""])) as Record<GrantField, string>), charityId: "new" };
    const categoryName = v.category?.trim() ?? "";
    const category = categoryByName.get(nameKey(categoryName));
    if (!categoryName) errors.push("Category: choose the category.");
    else if (!category) errors.push(`Category: no category is called “${categoryName}”. Add it under Settings → Grant categories.`);
    else if (!category.active) errors.push(`Category: “${category.name}” is inactive.`);
    else grant.categoryId = category.id;

    const statusName = v.status?.trim() ?? "";
    const status = statusName ? statusByName.get(nameKey(statusName)) : defaultStatus;
    if (statusName && !status) errors.push(`Status: no status is called “${statusName}”.`);
    else if (!status) {
      errors.push(`Status: it's blank, and no active status has the “${GRANT_STAGE_LABELS.SUBMITTED}” stage to use instead.`);
    } else if (!status.active) errors.push(`Status: “${status.name}” is inactive.`);
    else grant.statusId = status.id;

    for (const column of GRANT_COLUMNS) {
      const value = optionalAnswer(v[column]);
      grant[column] = DATE_COLUMNS.has(column) ? normaliseSubmissionDate(value) : value;
    }
    const parsed = grantSchema.safeParse(grant);
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        const label = GRANT_LABELS[issue.path[0] as GrantField] ?? "Value";
        // Category and status problems are already reported above in import terms.
        if (!errors.some((e) => e.startsWith(`${label}:`))) errors.push(`${label}: ${issue.message}`);
      }
    }

    if (errors.length || !charity.success || !parsed.success) {
      rowErrors.push({ row, message: errors.join(" ") });
      continue;
    }

    const match = matchCharity(charity.data);
    if (match && "error" in match) {
      rowErrors.push({ row, message: `Charity name: ${match.error}` });
      continue;
    }
    // One application per charity per day: a later one is taken to be the same one sent again.
    if (match?.days.has(parsed.data.dateSubmitted)) {
      sameDay++;
      continue;
    }
    const day = parsed.data.dateSubmitted;
    let plan = match;
    if (plan) {
      // Keep what is recorded; only fill in blank details.
      const fills = Object.fromEntries(
        CHARITY_FIELDS.filter((f) => !isContactField(f) && plan!.data[f] === null && charity.data[f] !== null).map((f) => [f, charity.data[f]]),
      );
      // Except the contact, taken as a whole from the newest application that gives one
      // (or from any application while the charity has none).
      const givesContact = Boolean(charity.data.contactName || charity.data.contactEmail);
      const newest = !plan.latest || day > plan.latest;
      const noContact = CONTACT_FIELDS.every((f) => plan!.data[f] === null);
      const contact = givesContact && (newest || noContact) ? Object.fromEntries(CONTACT_FIELDS.map((f) => [f, charity.data[f]])) : {};
      plan.data = { ...plan.data, ...fills, ...contact };
      if (fills.registrationNumber) planByReg.set(plan.data.registrationNumber!, plan);
    } else {
      plan = { id: null, data: charity.data, before: null, used: false, days: new Set(), latest: null };
      addPlan(plan);
    }
    plan.used = true;
    plan.days.add(day);
    if (!plan.latest || day > plan.latest) plan.latest = day;
    planned.push({ row, charity: plan, data: parsed.data, reference: reference || null });
  }

  const newCharities = plans.filter((p) => !p.id);
  const existingUsed = plans.filter((p) => p.id && p.used);
  const changed = existingUsed.filter((p) => changedFields(p).length > 0);
  const replaced = changed.filter(contactReplaced);
  const filled = changed.filter((p) => changedFields(p).some((f) => p.before![f] === null));
  const summary = importSummary({ created: planned.length, updated: 0, unchanged: 0 }, rowErrors);
  summary.notes = [
    plural(newCharities.length, "new charity", "new charities"),
    ...(existingUsed.length
      ? [
          `${plural(existingUsed.length, "existing charity", "existing charities")} matched` +
            (filled.length ? `, ${filled.length} with blank details filled in` : "") +
            (replaced.length ? `, ${replaced.length} with contact details updated` : ""),
        ]
      : []),
    ...(skipped ? [`${plural(skipped, "submission was", "submissions were")} imported before and will be skipped`] : []),
    ...(sameDay
      ? [`${plural(sameDay, "submission is", "submissions are")} from a charity with an application on the same day and will be skipped`]
      : []),
    ...(unknownColumns.length
      ? [`Column${unknownColumns.length > 1 ? "s" : ""} not imported: ${unknownColumns.map((h) => `“${h}”`).join(", ")}`]
      : []),
  ];
  if (rowErrors.length || !options.commit) return summary;

  // ---- Save ----
  try {
    await db().$transaction(
      async (tx) => {
        const ids = new Map<CharityPlan, string>();
        for (const p of newCharities) {
          const { id } = await tx.charity.create({ data: { ...p.data, createdById: actorId, updatedById: actorId }, select: { id: true } });
          ids.set(p, id);
        }
        for (const p of changed) {
          const changes = Object.fromEntries(changedFields(p).map((f) => [f, p.data[f]]));
          await tx.charity.update({ where: { id: p.id! }, data: { ...changes, updatedById: actorId } });
        }
        if (planned.length) {
          await tx.grant.createMany({
            data: planned.map((g) => ({
              ...grantData(g.data),
              charityId: g.charity.id ?? ids.get(g.charity)!,
              submissionReference: g.reference,
              createdById: actorId,
              updatedById: actorId,
            })),
          });
        }
      },
      { timeout: 120_000 },
    );
  } catch (error) {
    // Another import or edit got there first: a registration number or Random ID is now
    // taken, or a charity, category or status was deleted.
    if (error instanceof Prisma.PrismaClientKnownRequestError && ["P2002", "P2003", "P2025"].includes(error.code)) {
      return emptyImportSummary(["Records changed while the file was being imported. Nothing was saved; check the file again."]);
    }
    throw error;
  }
  return { ...summary, saved: true };
}
