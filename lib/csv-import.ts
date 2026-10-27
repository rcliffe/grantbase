import { CsvParseError, parseCsv, unescapeFormula } from "./csv";

/**
 * Shared pieces of the CSV imports (charities, grants): limits, the result shape,
 * reading the upload, and mapping the header row to known columns.
 */

/** Largest CSV file accepted for import. Keep below serverActions.bodySizeLimit in next.config.ts. */
export const IMPORT_MAX_BYTES = 2 * 1024 * 1024;
export const IMPORT_MAX_ROWS = 5000;
/** Row errors beyond this many are counted but not listed. */
export const IMPORT_MAX_LISTED_ERRORS = 100;

export type ImportRowError = { row: number; message: string };

export type ImportSummary = {
  /** False when the file has errors (nothing was saved) or this was only a check. */
  saved: boolean;
  created: number;
  updated: number;
  unchanged: number;
  /** Problems with the file as a whole (bad CSV, unknown columns …). */
  fileErrors: string[];
  /** The first IMPORT_MAX_LISTED_ERRORS row errors, in row order. */
  rowErrors: ImportRowError[];
  rowErrorCount: number;
  /** Further lines for the summary, e.g. charities added alongside the grants. */
  notes?: string[];
};

export type ImportState = {
  error?: string;
  /** "check" validates without saving; "import" saves when the file has no errors. */
  mode?: "check" | "import";
  fileName?: string;
  summary?: ImportSummary;
};

export function emptyImportSummary(fileErrors: string[] = []): ImportSummary {
  return { saved: false, created: 0, updated: 0, unchanged: 0, fileErrors, rowErrors: [], rowErrorCount: 0 };
}

/** Builds the summary for a checked file, listing at most IMPORT_MAX_LISTED_ERRORS row errors. */
export function importSummary(counts: { created: number; updated: number; unchanged: number }, rowErrors: ImportRowError[]): ImportSummary {
  const sorted = [...rowErrors].sort((a, b) => a.row - b.row);
  return { saved: false, ...counts, fileErrors: [], rowErrors: sorted.slice(0, IMPORT_MAX_LISTED_ERRORS), rowErrorCount: sorted.length };
}

/** Reads the mode and the uploaded file from an import form, enforcing size and UTF-8. */
export async function readCsvUpload(
  formData: FormData,
): Promise<{ ok: true; mode: "check" | "import"; fileName: string; text: string } | { ok: false; error: string }> {
  const mode = formData.get("mode") === "import" ? "import" : "check";
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { ok: false, error: "Choose a CSV file to import." };
  if (file.size > IMPORT_MAX_BYTES) {
    return { ok: false, error: `The file is larger than ${IMPORT_MAX_BYTES / 1024 / 1024} MB. Split it into smaller files.` };
  }
  try {
    const text = new TextDecoder("utf-8", { fatal: true }).decode(await file.arrayBuffer());
    return { ok: true, mode, fileName: file.name.slice(0, 200), text };
  } catch {
    return { ok: false, error: "The file isn't UTF-8 text. In Excel, save it as “CSV UTF-8 (Comma delimited)”." };
  }
}

/** Matches names the way the database collation does: ignoring case and accents. */
export const nameKey = (s: string) =>
  s
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim();

/** Header matching ignores case, spaces, hyphens and underscores. */
export const normaliseHeader = (h: string) => h.trim().toLowerCase().replace(/[\s_-]+/g, "");

export type ParsedRow<C extends string> = {
  /** Spreadsheet row number (the header is row 1). */
  row: number;
  /** Values of the columns present in the file, formula escaping removed. */
  values: Partial<Record<C, string>>;
  /** True when the row has non-blank cells beyond the header's columns. */
  tooManyCells: boolean;
  cellCount: number;
};

/**
 * Parses CSV text whose first row names the columns. `lookup` maps a header to its
 * column, "ignored" for known read-only columns, or null when unknown. Returns the
 * rows, or file-level errors (bad CSV, unknown/duplicate/missing columns, size).
 */
export function parseCsvWithHeader<C extends string>(
  text: string,
  options: { lookup: (header: string) => C | "ignored" | null; required: { column: C; header: string }[] },
): { ok: true; header: string[]; columns: (C | "ignored")[]; rows: ParsedRow<C>[] } | { ok: false; fileErrors: string[] } {
  let records: string[][];
  try {
    records = parseCsv(text);
  } catch (error) {
    if (error instanceof CsvParseError) return { ok: false, fileErrors: [`The file isn't valid CSV. ${error.message}`] };
    throw error;
  }
  if (records.length === 0) return { ok: false, fileErrors: ["The file is empty."] };

  const [header, ...rows] = records;
  const fileErrors: string[] = [];
  const unknown = header.filter((h) => h.trim() && !options.lookup(h));
  if (unknown.length) fileErrors.push(`Unrecognised column${unknown.length > 1 ? "s" : ""}: ${unknown.map((h) => `“${h}”`).join(", ")}.`);
  const columns: (C | "ignored")[] = [];
  for (const h of header) {
    const column = h.trim() ? options.lookup(h) : "ignored";
    if (column && column !== "ignored" && columns.includes(column)) fileErrors.push(`The column “${h}” appears more than once.`);
    columns.push(column ?? "ignored");
  }
  for (const { column, header: name } of options.required) {
    if (!columns.includes(column)) fileErrors.push(`The file needs a “${name}” column.`);
  }
  if (rows.length === 0) fileErrors.push("The file has a header row but no data.");
  if (rows.length > IMPORT_MAX_ROWS) {
    fileErrors.push(`The file has ${rows.length} rows; the most that can be imported at once is ${IMPORT_MAX_ROWS}.`);
  }
  if (fileErrors.length) return { ok: false, fileErrors };

  return {
    ok: true,
    header,
    columns,
    rows: rows.map((cells, i) => {
      const values: Partial<Record<C, string>> = {};
      columns.forEach((column, c) => {
        if (column !== "ignored") values[column] = unescapeFormula(cells[c] ?? "");
      });
      return { row: i + 2, values, tooManyCells: cells.slice(columns.length).some((c) => c.trim()), cellCount: cells.length };
    }),
  };
}
