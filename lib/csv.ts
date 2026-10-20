/**
 * Minimal RFC 4180 CSV reading and writing: comma-separated, double-quoted fields
 * with "" escapes, CRLF or LF line endings, optional UTF-8 byte order mark.
 */

export class CsvParseError extends Error {
  constructor(
    message: string,
    public readonly line: number,
  ) {
    super(`Line ${line}: ${message}`);
    this.name = "CsvParseError";
  }
}

/** Parses CSV text into rows of cells. Blank lines are skipped. */
export function parseCsv(text: string): string[][] {
  const input = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  let cellStarted = false; // distinguishes an empty line from a line holding one empty cell
  let line = 1;

  const endRow = () => {
    if (cellStarted || row.length > 0) {
      row.push(cell);
      rows.push(row);
    }
    row = [];
    cell = "";
    cellStarted = false;
  };

  for (let i = 0; i < input.length; i++) {
    const ch = input[i];
    if (quoted) {
      if (ch === '"') {
        if (input[i + 1] === '"') {
          cell += '"';
          i++;
        } else {
          quoted = false;
          const next = input[i + 1];
          if (next !== undefined && next !== "," && next !== "\r" && next !== "\n") {
            throw new CsvParseError("unexpected character after closing quote.", line);
          }
        }
      } else {
        if (ch === "\n") line++;
        cell += ch;
      }
    } else if (ch === '"') {
      if (cell !== "") throw new CsvParseError("quote in the middle of an unquoted value.", line);
      quoted = true;
      cellStarted = true;
    } else if (ch === ",") {
      row.push(cell);
      cell = "";
      cellStarted = true;
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && input[i + 1] === "\n") i++;
      endRow();
      line++;
    } else {
      cell += ch;
      cellStarted = true;
    }
  }
  if (quoted) throw new CsvParseError("a quoted value is never closed.", line);
  endRow();
  return rows;
}

/**
 * Spreadsheet apps run cells starting with these characters as formulas. Prefixing
 * an apostrophe makes them display as text (OWASP "CSV injection").
 */
const FORMULA_START = /^[=+\-@\t\r]/;

export function escapeFormula(value: string): string {
  return FORMULA_START.test(value) ? `'${value}` : value;
}

/** Reverses escapeFormula, so exported files can be imported unchanged. */
export function unescapeFormula(value: string): string {
  return value.startsWith("'") && FORMULA_START.test(value.slice(1)) ? value.slice(1) : value;
}

function formatCell(value: string): string {
  const safe = escapeFormula(value);
  return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

/**
 * Serialises rows as CSV with CRLF line endings and a byte order mark, so Excel
 * opens the file as UTF-8.
 */
export function toCsv(rows: readonly (readonly (string | number | null | undefined)[])[]): string {
  return "﻿" + rows.map((row) => row.map((v) => formatCell(v == null ? "" : String(v))).join(",")).join("\r\n") + "\r\n";
}
