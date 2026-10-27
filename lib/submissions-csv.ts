import { normaliseImportDate } from "./grant-csv";

/**
 * Reading an online application form's submissions report: one row per application,
 * holding both the charity's details and the grant request. Columns are recognised
 * by their question text, ignoring case, punctuation and anything in brackets, so
 * "Grant Request Amount (£)" and "grant request amount" are the same column.
 */

export type SubmissionColumn =
  // Charity
  | "charityName"
  | "registrationNumber"
  | "yearEstablished"
  | "address"
  | "description"
  | "website"
  | "contactName"
  | "contactPosition"
  | "contactEmail"
  // Grant
  | "category"
  | "amountRequested"
  | "purpose"
  | "accountsDate"
  | "income"
  | "expenditure"
  | "employees"
  | "volunteers"
  | "trustees"
  | "governmentFunding"
  | "otherFunders"
  | "penceInPound"
  | "reference"
  | "status"
  | "decisionDate"
  | "amountAgreed"
  | "dateSubmitted";

/** The report's columns, in the order the form exports them. `column` is null for columns that are ignored. */
export const SUBMISSION_CSV_COLUMNS = [
  { header: "Name of Charity/Organisation", column: "charityName", help: "Required. Matched to an existing charity by registration number, or else by name; otherwise a new charity is added." },
  { header: "Charity Registration Number ( England & Wales)", column: "registrationNumber", help: null },
  { header: "Year Established", column: "yearEstablished", help: null },
  { header: "Organisation Address", column: "address", help: "Split into address lines, town and postcode. Lines can be separated by commas or line breaks." },
  { header: "Brief Description Of Your Organisation", column: "description", help: "Up to 1,000 characters." },
  { header: "Website", column: "website", help: null },
  { header: "Name", column: "contactName", help: "The charity's contact." },
  { header: "Position In Organisation", column: "contactPosition", help: null },
  { header: "Email (This will used for communication)", column: "contactEmail", help: null },
  { header: "Select the category which best describes the work of your organisation", column: "category", help: "Required. The name of a grant category." },
  { header: "Grant Request Amount (£)", column: "amountRequested", help: "Required." },
  { header: "Brief description of your application for funding", column: "purpose", help: "The grant's purpose." },
  { header: "What is the date of your latest audited accounts?", column: "accountsDate", help: null },
  { header: "Income (£)", column: "income", help: null },
  { header: "Expenditure (£)", column: "expenditure", help: null },
  { header: "Number Of Employees", column: "employees", help: null },
  { header: "Number of Volunteers", column: "volunteers", help: null },
  { header: "Number of Trustees", column: "trustees", help: null },
  { header: "Funding from government / local authority (£)", column: "governmentFunding", help: null },
  { header: "Other funders", column: "otherFunders", help: null },
  { header: "What is your pence-in-the-pound ratio (0-100)", column: "penceInPound", help: null },
  { header: "Random ID", column: "reference", help: "The submission's ID. Submissions already imported are skipped, so the same report can be imported again as it grows." },
  { header: "Status", column: "status", help: "The name of a grant status. When blank, the first active status awaiting a decision." },
  { header: "Date Discussed", column: "decisionDate", help: "The decision date." },
  { header: "Recommended/Approved Amount (GBP)", column: "amountAgreed", help: "The amount agreed. Needs a Date Discussed." },
  { header: "Modified Time", column: null, help: null },
  { header: "IP Address", column: null, help: null },
  { header: "Added Email ID", column: null, help: null },
  { header: "Task Owner", column: null, help: null },
  { header: "Referrer Name", column: null, help: null },
  { header: "Added Time", column: "dateSubmitted", help: "Required. The date submitted; the time of day is ignored." },
] as const satisfies readonly { header: string; column: SubmissionColumn | null; help: string | null }[];

/** "Grant Request Amount (£)" → "grantrequestamount". */
const headerKey = (h: string) =>
  h
    .toLowerCase()
    .replace(/\([^)]*\)/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, "");

const HEADER_LOOKUP = new Map<string, SubmissionColumn | "ignored">(SUBMISSION_CSV_COLUMNS.map((c) => [headerKey(c.header), c.column ?? "ignored"]));

/** Maps a header cell to its column, "ignored" for known columns that aren't imported, or null when unknown. */
export function submissionColumnForHeader(header: string): SubmissionColumn | "ignored" | null {
  return HEADER_LOOKUP.get(headerKey(header)) ?? null;
}

/** Answers that mean "nothing to record" in an optional form field. */
const PLACEHOLDER = /^(n\/?a|none|nil|-+|tbc|not applicable|not registered|unregistered|exempt|excepted|pending|applied for)\.?$/i;

/** An optional answer, with placeholders such as "N/A" or "None" treated as blank. */
export function optionalAnswer(value: string | undefined): string {
  const trimmed = value?.trim() ?? "";
  return PLACEHOLDER.test(trimmed) ? "" : trimmed;
}

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

/**
 * Accepts the date formats forms export: "27-Oct-2026 14:32:10", "27 October 2026",
 * "27/10/2026 14:32" or "2026-10-27T14:32:10Z", returning YYYY-MM-DD. A time of day is
 * dropped. Anything else is returned unchanged, so validation reports it.
 */
export function normaliseSubmissionDate(value: string): string {
  const trimmed = value.trim();
  const date = trimmed.replace(/[ T]\d{1,2}:\d{2}(:\d{2}(\.\d+)?)?\s*([ap]m)?\s*(z|[+-]\d{2}:?\d{2})?$/i, "");
  const named = /^(\d{1,2})[\s/.-]+([a-z]{3,9})[\s/.,-]+(\d{4})$/i.exec(date);
  if (named) {
    const month = MONTHS.indexOf(named[2].slice(0, 3).toLowerCase()) + 1;
    if (month > 0) return normaliseImportDate(`${named[1]}/${month}/${named[3]}`);
  }
  return normaliseImportDate(date);
}

export type ParsedAddress = {
  addressLine1: string;
  addressLine2: string;
  town: string;
  postcode: string;
  country: string;
};

const UK_POSTCODE = /\b([A-Z]{1,2}\d[A-Z\d]?)\s*(\d[A-Z]{2})$/i;
const COUNTRY = /^(united kingdom|uk|great britain|england|wales|scotland|northern ireland)$/i;

/**
 * Splits a free-text address into the charity's address fields. Parts are separated
 * by line breaks or commas; a UK postcode and a country are recognised at the end, the
 * last remaining part is the town, and any middle parts become address line 2.
 */
export function parseAddress(value: string): ParsedAddress {
  const parts = value
    .split(/[\r\n,]+/)
    .map((p) => p.trim())
    .filter(Boolean);
  const result: ParsedAddress = { addressLine1: "", addressLine2: "", town: "", postcode: "", country: "" };

  if (parts.length > 1 && COUNTRY.test(parts[parts.length - 1])) result.country = parts.pop()!;
  const last = parts[parts.length - 1];
  const postcode = last ? UK_POSTCODE.exec(last) : null;
  if (postcode) {
    result.postcode = `${postcode[1]} ${postcode[2]}`.toUpperCase();
    const rest = last.slice(0, postcode.index).trim();
    if (rest) parts[parts.length - 1] = rest;
    else parts.pop();
  }
  if (!result.country && parts.length > 1 && COUNTRY.test(parts[parts.length - 1])) result.country = parts.pop()!;

  if (parts.length === 1) result.addressLine1 = parts[0];
  else if (parts.length > 1) {
    result.addressLine1 = parts[0];
    result.town = parts[parts.length - 1];
    result.addressLine2 = parts.slice(1, -1).join(", ");
  }
  return result;
}
