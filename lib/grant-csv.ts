import { normaliseHeader } from "./csv-import";
import { isIsoDate } from "./grants";

/** Columns that carry data on import. Charity, category and status are matched by name/number. */
export type GrantCsvColumn =
  | "id"
  | "charityName"
  | "charityRegistrationNumber"
  | "charityId"
  | "category"
  | "status"
  | "purpose"
  | "dateSubmitted"
  | "amountRequested"
  | "amountAgreed"
  | "decisionDate"
  | "paymentDate"
  | "accountsDate"
  | "income"
  | "expenditure"
  | "governmentFunding"
  | "otherFunders"
  | "penceInPound"
  | "employees"
  | "volunteers"
  | "trustees";

/** Columns of an exported file, in order. `column` is null for read-only columns. */
export const GRANT_CSV_COLUMNS = [
  { header: "ID", column: "id", help: "Leave blank for new grants. Exported files include it so edited rows update the right grant." },
  { header: "Charity", column: "charityName", help: "The charity's name. Used when there is no Charity ID or registration number." },
  { header: "Charity registration number", column: "charityRegistrationNumber", help: "Used to find the charity when there is no Charity ID." },
  { header: "Charity ID", column: "charityId", help: "Used first to find the charity. Change it only to move the grant to another charity." },
  { header: "Category", column: "category", help: "The name of a grant category, e.g. Capital." },
  { header: "Status", column: "status", help: "The name of a grant status, e.g. Awarded." },
  { header: "Purpose", column: "purpose", help: "Up to 4,000 characters." },
  { header: "Date submitted", column: "dateSubmitted", help: "Required for new grants." },
  { header: "Amount requested", column: "amountRequested", help: "In pounds, e.g. 2500 or £2,500.00. Required for new grants." },
  { header: "Amount agreed", column: "amountAgreed", help: "In pounds. Needs a decision date." },
  { header: "Decision date", column: "decisionDate", help: null },
  { header: "Payment date", column: "paymentDate", help: null },
  { header: "Date of latest audited accounts", column: "accountsDate", help: "The charity's figures as stated in the application." },
  { header: "Income", column: "income", help: "In pounds." },
  { header: "Expenditure", column: "expenditure", help: "In pounds." },
  { header: "Government funding", column: "governmentFunding", help: "From government or local authorities, in pounds." },
  { header: "Other funders", column: "otherFunders", help: "Up to 1,500 characters." },
  { header: "Pence in the pound", column: "penceInPound", help: "Pence of each pound spent on charitable activities, 0 to 100." },
  { header: "Employees", column: "employees", help: "Whole numbers." },
  { header: "Volunteers", column: "volunteers", help: null },
  { header: "Trustees", column: "trustees", help: null },
  { header: "Submission reference", column: null, help: "The online-form submission the grant came from. Ignored on import." },
  { header: "Created at", column: null, help: "Ignored on import." },
  { header: "Updated at", column: null, help: "Ignored on import." },
] as const satisfies readonly { header: string; column: GrantCsvColumn | null; help: string | null }[];

/** Header names for error messages. */
export const GRANT_CSV_LABELS = Object.fromEntries(GRANT_CSV_COLUMNS.flatMap((c) => (c.column ? [[c.column, c.header]] : []))) as Record<
  GrantCsvColumn,
  string
>;

const HEADER_LOOKUP = new Map<string, GrantCsvColumn | "ignored">(
  GRANT_CSV_COLUMNS.flatMap((c) => {
    const column = c.column ?? "ignored";
    // Accept the export header ("Date submitted") and the field name ("dateSubmitted").
    return [[normaliseHeader(c.header), column] as const, ...(c.column ? [[normaliseHeader(c.column), column] as const] : [])];
  }),
);

/** Maps a header cell to its column, "ignored" for read-only columns, or null when it isn't recognised. */
export function grantColumnForHeader(header: string): GrantCsvColumn | "ignored" | null {
  return HEADER_LOOKUP.get(normaliseHeader(header)) ?? null;
}

/**
 * Accepts dates as YYYY-MM-DD (as exported) or DD/MM/YYYY (as Excel saves them in
 * the UK), returning YYYY-MM-DD. Anything else is returned unchanged, so validation
 * reports it.
 */
export function normaliseImportDate(value: string): string {
  const trimmed = value.trim();
  const uk = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(trimmed);
  if (!uk) return trimmed;
  const iso = `${uk[3]}-${uk[2].padStart(2, "0")}-${uk[1].padStart(2, "0")}`;
  return isIsoDate(iso) ? iso : trimmed;
}
