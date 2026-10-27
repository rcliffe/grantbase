import { z } from "zod";
import type { Role } from "./roles";

/**
 * Minimum role for each grant operation. Pages and actions enforce these on the
 * server via requireRole(); the UI uses them only to decide which buttons to show.
 */
export const GRANT_PERMISSIONS = {
  view: "VIEWER",
  export: "VIEWER",
  edit: "EDITOR",
  import: "EDITOR",
  /** Approve, reject and mark as paid (the Decisions and Payments pages). */
  process: "EDITOR",
  delete: "ADMINISTRATOR",
} as const satisfies Record<string, Role>;

export const GRANT_PAGE_SIZE = 25;
export const GRANT_PURPOSE_MAX_LENGTH = 4000;

/** First line of the purpose, shortened, for lists and labels. */
export function purposeSummary(purpose: string, max = 80): string {
  const line = purpose.split(/\r?\n/, 1)[0].trim();
  return line.length > max ? `${line.slice(0, max - 1).trimEnd()}…` : line;
}

/** Largest amount a DECIMAL(12,2) column holds. */
const MAX_AMOUNT = 9_999_999_999.99;

/**
 * Parses an amount in pounds such as "1234", "£1,234.50" or "1 234.5" into a
 * canonical "1234.50" string, or null when it isn't a valid non-negative amount.
 * Amounts stay strings end to end, so no floating-point rounding is involved.
 */
export function parseAmount(value: string): string | null {
  const cleaned = value.trim().replace(/^£\s*/, "").replace(/[,\s]/g, "");
  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(cleaned);
  if (!match) return null;
  const pounds = match[1].replace(/^0+(?=\d)/, "");
  const amount = `${pounds}.${(match[2] ?? "").padEnd(2, "0")}`;
  return Number(amount) <= MAX_AMOUNT ? amount : null;
}

function amountSchema(label: string, required: boolean) {
  return z
    .string()
    .trim()
    .transform((value, ctx) => {
      if (value === "") {
        if (!required) return null;
        ctx.addIssue({ code: "custom", message: `Enter the ${label.toLowerCase()}.` });
        return z.NEVER;
      }
      const amount = parseAmount(value);
      if (amount === null) {
        ctx.addIssue({ code: "custom", message: `Enter the ${label.toLowerCase()} in pounds, e.g. 2500 or 2,500.00.` });
        return z.NEVER;
      }
      return amount;
    });
}

/** True for a real calendar date written as YYYY-MM-DD (as `<input type="date">` submits). */
export function isIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(value);
}

function dateSchema(label: string, required: boolean) {
  return z
    .string()
    .trim()
    .transform((value, ctx) => {
      if (value === "") {
        if (!required) return null;
        ctx.addIssue({ code: "custom", message: `Enter the ${label.toLowerCase()}.` });
        return z.NEVER;
      }
      const year = Number(value.slice(0, 4));
      if (!isIsoDate(value) || year < 1900 || year > 2100) {
        ctx.addIssue({ code: "custom", message: `Enter a valid ${label.toLowerCase()}.` });
        return z.NEVER;
      }
      return value;
    });
}

/** Largest staff, volunteer or trustee count accepted; guards against typos. */
const MAX_COUNT = 1_000_000;

/** An optional whole number such as "12" or "1,200", or null when blank. */
function countSchema(label: string, max: number) {
  return z
    .string()
    .trim()
    .transform((value, ctx) => {
      if (value === "") return null;
      const cleaned = value.replace(/,/g, "");
      const n = /^\d+$/.test(cleaned) ? Number(cleaned) : NaN;
      if (!(n <= max)) {
        ctx.addIssue({ code: "custom", message: `Enter the ${label.toLowerCase()} as a whole number from 0 to ${max.toLocaleString("en-GB")}.` });
        return z.NEVER;
      }
      return n;
    });
}

const idSchema = (message: string) => z.string().trim().min(1, message).max(36, message);

export const grantSchema = z
  .object({
    charityId: idSchema("Choose the charity."),
    categoryId: idSchema("Choose a category."),
    statusId: idSchema("Choose a status."),
    purpose: z
      .string()
      .trim()
      .max(GRANT_PURPOSE_MAX_LENGTH, `Purpose must be at most ${GRANT_PURPOSE_MAX_LENGTH.toLocaleString("en-GB")} characters.`)
      .transform((v) => (v === "" ? null : v)),
    // Required: an empty value fails inside the transform, so the result is a string.
    dateSubmitted: dateSchema("Date submitted", true).pipe(z.string()),
    amountRequested: amountSchema("Amount requested", true).pipe(z.string()),
    amountAgreed: amountSchema("Amount agreed", false),
    decisionDate: dateSchema("Decision date", false),
    paymentDate: dateSchema("Payment date", false),
    accountsDate: dateSchema("Date of latest audited accounts", false),
    income: amountSchema("Income", false),
    expenditure: amountSchema("Expenditure", false),
    governmentFunding: amountSchema("Government funding", false),
    otherFunders: z
      .string()
      .trim()
      .max(1000, "Other funders must be at most 1,000 characters.")
      .transform((v) => (v === "" ? null : v)),
    // Written as "85", "85p" or "85%".
    penceInPound: z
      .string()
      .transform((v) => v.trim().replace(/\s*[p%]$/i, ""))
      .pipe(countSchema("Pence in the pound", 100)),
    employees: countSchema("Number of employees", MAX_COUNT),
    volunteers: countSchema("Number of volunteers", MAX_COUNT),
    trustees: countSchema("Number of trustees", MAX_COUNT),
  })
  // ISO dates compare correctly as strings.
  .superRefine((g, ctx) => {
    if (g.decisionDate && g.decisionDate < g.dateSubmitted) {
      ctx.addIssue({ code: "custom", path: ["decisionDate"], message: "The decision date can't be before the date submitted." });
    }
    if (g.amountAgreed !== null && !g.decisionDate) {
      ctx.addIssue({ code: "custom", path: ["decisionDate"], message: "Enter the decision date for the agreed amount." });
    }
    if (g.paymentDate) {
      if (g.amountAgreed === null || g.amountAgreed === "0.00") {
        ctx.addIssue({ code: "custom", path: ["paymentDate"], message: "A payment date needs an agreed amount above zero." });
      } else if (g.decisionDate && g.paymentDate < g.decisionDate) {
        ctx.addIssue({ code: "custom", path: ["paymentDate"], message: "The payment date can't be before the decision date." });
      } else if (g.paymentDate < g.dateSubmitted) {
        ctx.addIssue({ code: "custom", path: ["paymentDate"], message: "The payment date can't be before the date submitted." });
      }
    }
  });

export type GrantInput = z.infer<typeof grantSchema>;

export const GRANT_FIELDS = [
  "charityId",
  "categoryId",
  "statusId",
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
] as const satisfies readonly (keyof GrantInput)[];

type Field = (typeof GRANT_FIELDS)[number];

/** A stored amount: a Prisma Decimal on the server, or a "2500.00" string. */
type StoredAmount = { toFixed(digits: number): string } | string | null;

/** A stored grant's fields, as the database or the service layer returns them. */
export type StoredGrantFields = {
  charityId: string;
  categoryId: string;
  statusId: string;
  purpose: string | null;
  dateSubmitted: Date;
  amountRequested: StoredAmount;
  amountAgreed: StoredAmount;
  decisionDate: Date | null;
  paymentDate: Date | null;
  accountsDate: Date | null;
  income: StoredAmount;
  expenditure: StoredAmount;
  governmentFunding: StoredAmount;
  otherFunders: string | null;
  penceInPound: number | null;
  employees: number | null;
  volunteers: number | null;
  trustees: number | null;
};

const amountValue = (a: StoredAmount) => (a === null ? "" : typeof a === "string" ? a : a.toFixed(2));

/** Form-style string values for a stored grant, as the form and imports validate them. */
export function grantToValues(g: StoredGrantFields): Record<Field, string> {
  return {
    charityId: g.charityId,
    categoryId: g.categoryId,
    statusId: g.statusId,
    purpose: g.purpose ?? "",
    dateSubmitted: toDateInput(g.dateSubmitted),
    amountRequested: amountValue(g.amountRequested),
    amountAgreed: amountValue(g.amountAgreed),
    decisionDate: toDateInput(g.decisionDate),
    paymentDate: toDateInput(g.paymentDate),
    accountsDate: toDateInput(g.accountsDate),
    income: amountValue(g.income),
    expenditure: amountValue(g.expenditure),
    governmentFunding: amountValue(g.governmentFunding),
    otherFunders: g.otherFunders ?? "",
    penceInPound: g.penceInPound?.toString() ?? "",
    employees: g.employees?.toString() ?? "",
    volunteers: g.volunteers?.toString() ?? "",
    trustees: g.trustees?.toString() ?? "",
  };
}

/** Prisma data for a validated grant: calendar dates become UTC midnight. */
export function grantData(g: GrantInput) {
  const date = (iso: string | null) => (iso ? new Date(`${iso}T00:00:00Z`) : null);
  return {
    ...g,
    dateSubmitted: new Date(`${g.dateSubmitted}T00:00:00Z`),
    decisionDate: date(g.decisionDate),
    paymentDate: date(g.paymentDate),
    accountsDate: date(g.accountsDate),
  };
}

const money = new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" });
const longDate = new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeZone: "UTC" });

/** "£2,500.00" from a decimal string such as "2500.00". */
export function formatMoney(amount: string): string {
  return money.format(Number(amount));
}

/** "12 Mar 2026". Dates are stored as UTC midnight, so format in UTC. */
export function formatDate(date: Date): string {
  return longDate.format(date);
}

/** The YYYY-MM-DD value for `<input type="date">`. */
export function toDateInput(date: Date | null): string {
  return date ? date.toISOString().slice(0, 10) : "";
}
