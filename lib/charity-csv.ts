import { CHARITY_FIELDS, type CharityInput } from "./charities";
import { normaliseHeader } from "./csv-import";

type CharityField = (typeof CHARITY_FIELDS)[number];

/** Columns of an exported file, in order. `field` is null for read-only columns. */
export const CHARITY_CSV_COLUMNS = [
  { header: "ID", field: null, help: "Leave blank for new charities. Exported files include it so edited rows update the right charity." },
  { header: "Name", field: "name", help: "Required." },
  { header: "Registration number", field: "registrationNumber", help: "Rows without an ID update the charity with this number, if there is one." },
  { header: "Year established", field: "yearEstablished", help: "Four digits, e.g. 1998." },
  { header: "Description", field: "description", help: "Up to 1,000 characters." },
  { header: "Address line 1", field: "addressLine1", help: null },
  { header: "Address line 2", field: "addressLine2", help: null },
  { header: "Town or city", field: "town", help: null },
  { header: "County", field: "county", help: null },
  { header: "Postcode", field: "postcode", help: null },
  { header: "Country", field: "country", help: null },
  { header: "Contact email", field: "contactEmail", help: null },
  { header: "Website", field: "website", help: null },
  { header: "Created at", field: null, help: "Ignored on import." },
  { header: "Updated at", field: null, help: "Ignored on import." },
] as const satisfies readonly { header: string; field: CharityField | null; help: string | null }[];

export type CharityCsvColumn = "id" | CharityField | "ignored";


const HEADER_LOOKUP = new Map<string, CharityCsvColumn>(
  CHARITY_CSV_COLUMNS.flatMap((c): [string, CharityCsvColumn][] => {
    const column: CharityCsvColumn = c.header === "ID" ? "id" : (c.field ?? "ignored");
    // Accept the export header ("Town or city") and the field name ("town").
    return [[normaliseHeader(c.header), column], ...(c.field ? [[normaliseHeader(c.field), column] as [string, CharityCsvColumn]] : [])];
  }),
);

/** Maps a header cell to its column, or null when it isn't recognised. */
export function charityColumnForHeader(header: string): CharityCsvColumn | null {
  return HEADER_LOOKUP.get(normaliseHeader(header)) ?? null;
}

/** Form-style string values for a stored charity, as the import validates them. */
export function charityToValues(c: CharityInput): Record<CharityField, string> {
  return Object.fromEntries(CHARITY_FIELDS.map((f) => [f, c[f] == null ? "" : String(c[f])])) as Record<CharityField, string>;
}
