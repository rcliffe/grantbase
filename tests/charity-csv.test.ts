import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { importCharitiesAction } from "@/app/(app)/charities/actions";
import { GET as exportRoute } from "@/app/(app)/charities/export/route";
import { IMPORT_MAX_BYTES, IMPORT_MAX_LISTED_ERRORS } from "@/lib/csv-import";
import { CsvParseError, parseCsv, toCsv } from "@/lib/csv";
import { db } from "@/server/db/client";
import { expectRedirect, makeUser, resetDatabase, signIn } from "./support/fixtures";
import { actAs } from "./support/request";

beforeEach(async () => {
  await resetDatabase();
  actAs(null);
});
afterAll(() => db().$disconnect());

async function signedInAs(role: "VIEWER" | "EDITOR" | "ADMINISTRATOR") {
  const user = await makeUser(role);
  actAs(await signIn(user.email));
  return user;
}

const exportCsv = (query = "") => exportRoute(new Request(`http://localhost/charities/export${query ? `?q=${encodeURIComponent(query)}` : ""}`));

function upload(content: string | Uint8Array<ArrayBuffer>, mode: "check" | "import" = "import", name = "charities.csv") {
  const fd = new FormData();
  fd.set("mode", mode);
  fd.set("file", new File([content], name, { type: "text/csv" }));
  return importCharitiesAction({}, fd);
}

const csv = (...lines: string[]) => lines.join("\n");

describe("CSV reading and writing", () => {
  it("round-trips quotes, commas, line breaks and Unicode", () => {
    const rows = [
      ["a", "b, with comma", 'say "hi"'],
      ["multi\nline", "", "Café Ünited"],
    ];
    const text = toCsv(rows);
    expect(text.startsWith("﻿")).toBe(true);
    expect(text).toContain("\r\n");
    expect(parseCsv(text)).toEqual(rows);
  });

  it("accepts LF and CRLF, skips blank lines and keeps empty cells", () => {
    expect(parseCsv("a,b\r\n\r\n1,\n,2\n")).toEqual([["a", "b"], ["1", ""], ["", "2"]]);
  });

  it("neutralises spreadsheet formulas on export and restores them on import", () => {
    const text = toCsv([["=HYPERLINK(\"http://evil\")", "+1", "-2", "@SUM(A1)", "plain"]]);
    expect(parseCsv(text)[0]).toEqual(["'=HYPERLINK(\"http://evil\")", "'+1", "'-2", "'@SUM(A1)", "plain"]);
  });

  it("reports malformed quoting with a line number", () => {
    expect(() => parseCsv('a,b\n"unclosed,c')).toThrow(CsvParseError);
    expect(() => parseCsv('a,b\n1,x"y"')).toThrow(/Line 2/);
    expect(() => parseCsv('"a"b')).toThrow(/after closing quote/);
  });
});

describe("charity CSV export", () => {
  it("requires a signed-in user", async () => {
    await expectRedirect(exportCsv(), "/sign-in");
  });

  it("lets viewers download every field, filtered by the list search", async () => {
    await db().charity.createMany({
      data: [
        { name: "Riverside Food Bank", town: "Leeds", registrationNumber: "1234567", yearEstablished: 1998, description: 'Food, "parcels"\nand advice' },
        { name: "=Formula Trust", town: "York" },
      ],
    });
    await signedInAs("VIEWER");

    const response = await exportCsv();
    expect(response.headers.get("content-type")).toBe("text/csv; charset=utf-8");
    expect(response.headers.get("content-disposition")).toMatch(/^attachment; filename="charities-\d{4}-\d{2}-\d{2}\.csv"$/);
    expect(response.headers.get("cache-control")).toContain("no-store");

    const [header, ...rows] = parseCsv(await response.text());
    expect(header.slice(0, 5)).toEqual(["ID", "Name", "Registration number", "Year established", "Description"]);
    expect(rows.map((r) => r[1])).toEqual(["'=Formula Trust", "Riverside Food Bank"]);
    const riverside = Object.fromEntries(header.map((h, i) => [h, rows[1][i]]));
    expect(riverside).toMatchObject({ "Year established": "1998", Description: 'Food, "parcels"\nand advice', "Town or city": "Leeds" });

    const filtered = parseCsv(await (await exportCsv("york")).text());
    expect(filtered).toHaveLength(2);
    expect(filtered[1][1]).toBe("'=Formula Trust");
  });
});

describe("charity CSV import", () => {
  it("is only available to editors and above", async () => {
    await expectRedirect(upload(csv("Name", "A")), "/sign-in");
    await signedInAs("VIEWER");
    await expectRedirect(upload(csv("Name", "A")), "/forbidden");
    expect(await db().charity.count()).toBe(0);
  });

  it("checks a file without saving it", async () => {
    await signedInAs("EDITOR");
    const result = await upload(csv("Name,Town", "One,Leeds", "Two,York"), "check");
    expect(result).toMatchObject({ mode: "check", fileName: "charities.csv", summary: { saved: false, created: 2, updated: 0, rowErrorCount: 0 } });
    expect(await db().charity.count()).toBe(0);
  });

  it("creates charities, normalising values and recording who imported them", async () => {
    const editor = await signedInAs("EDITOR");
    const result = await upload(
      csv(
        "name,registration_number,Year established,Description,postcode,Contact email,website",
        'Riverside,sc 012345,1998,"Food parcels,\nadvice",ls1 1aa,Hello@Riverside.example,riverside.example',
      ),
    );
    expect(result.summary).toMatchObject({ saved: true, created: 1 });
    expect(await db().charity.findFirstOrThrow()).toMatchObject({
      name: "Riverside",
      registrationNumber: "SC012345",
      yearEstablished: 1998,
      description: "Food parcels,\nadvice",
      postcode: "LS1 1AA",
      contactEmail: "hello@riverside.example",
      website: "https://riverside.example",
      createdById: editor.id,
      updatedById: editor.id,
    });
  });

  it("updates by ID, then by registration number, keeping columns the file leaves out", async () => {
    const [byId, byReg] = await Promise.all([
      db().charity.create({ data: { name: "Old name", town: "Leeds", website: "https://keep.example" } }),
      db().charity.create({ data: { name: "Reg Trust", registrationNumber: "SC012345", town: "York" } }),
    ]);
    const editor = await signedInAs("EDITOR");

    const result = await upload(csv("ID,Name,Registration number,Town or city", `${byId.id},New name,,`, ",Reg Trust,sc 012 345,Hull", ",Brand new,,"));
    expect(result.summary).toMatchObject({ saved: true, created: 1, updated: 2, unchanged: 0 });

    expect(await db().charity.findUniqueOrThrow({ where: { id: byId.id } })).toMatchObject({
      name: "New name",
      town: null, // present but blank: cleared
      website: "https://keep.example", // column absent: kept
      updatedById: editor.id,
    });
    expect(await db().charity.findUniqueOrThrow({ where: { id: byReg.id } })).toMatchObject({ name: "Reg Trust", town: "Hull" });
    expect(await db().charity.count()).toBe(3);
  });

  it("re-importing an unedited export changes nothing", async () => {
    await db().charity.createMany({
      data: [
        { name: "=Formula Trust", registrationNumber: "1000001", yearEstablished: 2001, description: "Line one\nLine two" },
        { name: "Plain", website: "https://plain.example", postcode: "LS1 1AA" },
      ],
    });
    const before = await db().charity.findMany({ orderBy: { id: "asc" } });
    await signedInAs("EDITOR");

    const exported = await (await exportCsv()).text();
    const result = await upload(exported);
    expect(result.summary).toMatchObject({ saved: true, created: 0, updated: 0, unchanged: 2, rowErrorCount: 0 });
    expect(await db().charity.findMany({ orderBy: { id: "asc" } })).toEqual(before);
  });

  it("saves nothing when any row is invalid, and says which rows", async () => {
    await db().charity.create({ data: { name: "Taken", registrationNumber: "1234567" } });
    await signedInAs("EDITOR");

    const result = await upload(
      csv(
        "ID,Name,Registration number,Year established,Website",
        ",Fine,,,",
        ",,,,", // no name
        ",Bad year,,202,",
        ",Bad site,,,javascript:alert(1)",
        "missing-id,Ghost,,,",
        ",Dup A,7654321,,",
        ",Dup B,7 654 321,,",
        ",Too many,,,,extra",
      ),
    );
    expect(result.summary?.saved).toBe(false);
    const messages = Object.fromEntries(result.summary!.rowErrors.map((e) => [e.row, e.message]));
    expect(Object.keys(messages).map(Number)).toEqual([3, 4, 5, 6, 8, 9]);
    expect(messages[3]).toMatch(/^Name: /);
    expect(messages[4]).toMatch(/^Year established: /);
    expect(messages[5]).toMatch(/^Website: /);
    expect(messages[6]).toMatch(/No charity has the ID “missing-id”/);
    expect(messages[8]).toMatch(/also used in row 7/);
    expect(messages[9]).toMatch(/Has 6 values/);
    expect(await db().charity.count()).toBe(1);
  });

  it("rejects a registration number that belongs to another charity", async () => {
    const [a] = await Promise.all([
      db().charity.create({ data: { name: "A", registrationNumber: "1111111" } }),
      db().charity.create({ data: { name: "B", registrationNumber: "2222222" } }),
    ]);
    await signedInAs("EDITOR");
    const result = await upload(csv("ID,Name,Registration number", `${a.id},A,2222222`));
    expect(result.summary?.rowErrors).toEqual([{ row: 2, message: "Registration number 2222222 already belongs to B." }]);
  });

  it("rejects two rows that update the same charity", async () => {
    const a = await db().charity.create({ data: { name: "A", registrationNumber: "1111111" } });
    await signedInAs("EDITOR");
    const result = await upload(csv("ID,Name,Registration number", `${a.id},A1,`, ",A2,1111111"));
    expect(result.summary?.rowErrors).toEqual([{ row: 3, message: "Updates the same charity as row 2 (A)." }]);
  });

  it("reports problems with the file as a whole", async () => {
    await signedInAs("EDITOR");
    const fileErrors = async (content: string) => (await upload(content)).summary?.fileErrors;

    expect(await fileErrors("\n")).toEqual(["The file is empty."]);
    expect(await fileErrors("Name")).toEqual(["The file has a header row but no data."]);
    expect(await fileErrors(csv("Name,Colour,Size", "A,,"))).toEqual(["Unrecognised columns: “Colour”, “Size”."]);
    // Headers match ignoring case, spaces, hyphens and underscores.
    expect(await fileErrors(csv("NAME,Post code,contact-email", "A,,"))).toEqual([]);
    expect(await fileErrors(csv("Town", "Leeds"))).toEqual(["The file needs a “Name” column."]);
    expect(await fileErrors(csv("Name,name", "A,B"))).toEqual(["The column “name” appears more than once."]);
    expect((await fileErrors('Name\n"unclosed'))?.[0]).toMatch(/isn't valid CSV/);
  });

  it("lists at most a fixed number of row errors but counts them all", async () => {
    await signedInAs("EDITOR");
    const result = await upload(csv("Name,Year established", ...Array.from({ length: 150 }, (_, i) => `C${i},1`)));
    expect(result.summary?.rowErrors).toHaveLength(IMPORT_MAX_LISTED_ERRORS);
    expect(result.summary?.rowErrorCount).toBe(150);
  });

  it("rejects missing, oversized and non-UTF-8 files", async () => {
    await signedInAs("EDITOR");
    expect((await upload("")).error).toMatch(/Choose a CSV file/);
    expect((await upload("x".repeat(IMPORT_MAX_BYTES + 1))).error).toMatch(/larger than 2 MB/);
    // "Café" in Windows-1252, as older Excel versions save "CSV".
    expect((await upload(new Uint8Array([0x4e, 0x61, 0x6d, 0x65, 0x0a, 0x43, 0x61, 0x66, 0xe9]))).error).toMatch(/UTF-8/);
    expect(await db().charity.count()).toBe(0);
  });
});
