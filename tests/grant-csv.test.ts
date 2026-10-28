import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { importGrantsAction } from "@/app/(app)/grants/actions";
import type { Prisma } from "@/generated/prisma/client";
import { GET as exportRoute } from "@/app/(app)/grants/export/route";
import { parseCsv } from "@/lib/csv";
import { normaliseImportDate } from "@/lib/grant-csv";
import { db } from "@/server/db/client";
import { expectRedirect, makeUser, resetDatabase, signIn } from "./support/fixtures";
import { actAs } from "./support/request";

let riverside: { id: string };
let hilltop: { id: string };
let capital: { id: string };
let revenue: { id: string };
let submitted: { id: string };
let awarded: { id: string };

const d = (iso: string) => new Date(`${iso}T00:00:00Z`);

beforeEach(async () => {
  await resetDatabase();
  actAs(null);
  riverside = await db().charity.create({ data: { name: "Riverside Food Bank", registrationNumber: "1234567" } });
  hilltop = await db().charity.create({ data: { name: "Hilltop Trust" } });
  capital = await db().grantCategory.create({ data: { name: "Capital", sortOrder: 1 } });
  revenue = await db().grantCategory.create({ data: { name: "Revenue", sortOrder: 2 } });
  submitted = await db().grantStatus.create({ data: { name: "Submitted", sortOrder: 1 } });
  awarded = await db().grantStatus.create({ data: { name: "Awarded", sortOrder: 2 } });
});
afterAll(() => db().$disconnect());

async function signedInAs(role: "VIEWER" | "EDITOR" | "ADMINISTRATOR") {
  const user = await makeUser(role);
  actAs(await signIn(user.email));
  return user;
}

const exportCsv = (params = "") => exportRoute(new Request(`http://localhost/grants/export${params ? `?${params}` : ""}`));

function upload(content: string, mode: "check" | "import" = "import") {
  const fd = new FormData();
  fd.set("mode", mode);
  fd.set("file", new File([content], "grants.csv", { type: "text/csv" }));
  return importGrantsAction({}, fd);
}

const csv = (...lines: string[]) => lines.join("\n");
const HEADER = "Charity,Category,Status,Date submitted,Amount requested";

async function makeGrant(overrides: Partial<Prisma.GrantUncheckedCreateInput> = {}) {
  return db().grant.create({
    data: {
      charityId: riverside.id,
      categoryId: capital.id,
      statusId: submitted.id,
      purpose: "Replacement minibus",
      dateSubmitted: d("2026-03-12"),
      amountRequested: "25000",
      ...overrides,
    },
  });
}

describe("import dates", () => {
  it("accepts ISO and UK day/month/year dates", () => {
    expect(normaliseImportDate("2026-03-12")).toBe("2026-03-12");
    expect(normaliseImportDate("12/03/2026")).toBe("2026-03-12");
    expect(normaliseImportDate("1/3/2026")).toBe("2026-03-01");
    expect(normaliseImportDate("31/02/2026")).toBe("31/02/2026"); // left for validation to reject
    expect(normaliseImportDate("next week")).toBe("next week");
  });
});

describe("grant CSV export", () => {
  it("requires a signed-in user", async () => {
    await expectRedirect(exportCsv(), "/sign-in");
  });

  it("lets viewers download every field, filtered like the list", async () => {
    await makeGrant({ purpose: "=cmd|' /C calc'!A0\nsecond line", amountAgreed: "20000.5", decisionDate: d("2026-04-01"), statusId: awarded.id });
    await makeGrant({ charityId: hilltop.id, categoryId: revenue.id, purpose: "Core costs", dateSubmitted: d("2026-05-02"), amountRequested: "8000" });
    await signedInAs("VIEWER");

    const response = await exportCsv();
    expect(response.headers.get("content-disposition")).toMatch(/^attachment; filename="grants-\d{4}-\d{2}-\d{2}\.csv"$/);
    const [header, ...rows] = parseCsv(await response.text());
    expect(header).toEqual([
      "ID", "Charity", "Charity registration number", "Charity ID", "Category", "Status", "Purpose",
      "Date submitted", "Amount requested", "Amount agreed", "Decision date", "Payment date",
      "Date of latest audited accounts", "Income", "Expenditure", "Government funding", "Other funders", "Pence in the pound",
      "Employees", "Volunteers", "Trustees", "Submission reference", "Created at", "Updated at",
    ]);
    const byPurpose = Object.fromEntries(rows.map((r) => [r[6], Object.fromEntries(header.map((h, i) => [h, r[i]]))]));
    expect(byPurpose["'=cmd|' /C calc'!A0\nsecond line"]).toMatchObject({
      Charity: "Riverside Food Bank",
      "Charity registration number": "1234567",
      Status: "Awarded",
      "Date submitted": "2026-03-12",
      "Amount requested": "25000.00",
      "Amount agreed": "20000.50",
      "Decision date": "2026-04-01",
      "Payment date": "",
    });

    const filtered = parseCsv(await (await exportCsv(`status=${awarded.id}`)).text());
    expect(filtered).toHaveLength(2);
    expect(parseCsv(await (await exportCsv("q=hilltop")).text())[1][1]).toBe("Hilltop Trust");
    expect(parseCsv(await (await exportCsv("from=2026-05-01&to=2026-05-31")).text()).map((r) => r[1])).toEqual(["Charity", "Hilltop Trust"]);
    // In the list's order: newest first unless sort=oldest.
    const dates = async (params: string) => parseCsv(await (await exportCsv(params)).text()).slice(1).map((r) => r[7]);
    expect(await dates("sort=oldest")).toEqual((await dates("")).reverse());
  });
});

describe("grant CSV import", () => {
  it("is only available to editors and above", async () => {
    await expectRedirect(upload(csv(HEADER, "Hilltop Trust,Capital,Submitted,2026-01-01,100")), "/sign-in");
    await signedInAs("VIEWER");
    await expectRedirect(upload(csv(HEADER, "Hilltop Trust,Capital,Submitted,2026-01-01,100")), "/forbidden");
    expect(await db().grant.count()).toBe(0);
  });

  it("checks a file without saving it", async () => {
    await signedInAs("EDITOR");
    const result = await upload(csv(HEADER, "Hilltop Trust,Capital,Submitted,2026-01-01,100"), "check");
    expect(result.summary).toMatchObject({ saved: false, created: 1, rowErrorCount: 0 });
    expect(await db().grant.count()).toBe(0);
  });

  it("creates grants, finding charities by ID, registration number or name", async () => {
    const editor = await signedInAs("EDITOR");
    const result = await upload(
      csv(
        "Charity,Charity registration number,Charity ID,Category,Status,Purpose,Date submitted,Amount requested,Amount agreed,Decision date,Payment date",
        `,,${hilltop.id},capital,SUBMITTED,By ID,2026-01-01,100,,,`,
        ",12 345 67,,Revenue,Awarded,By registration number,15/01/2026,\"£2,500.50\",2000,01/02/2026,2026-02-15",
        "hilltop trust,,,Capital,Submitted,By name,2026-01-20,300,,,",
      ),
    );
    expect(result.summary).toMatchObject({ saved: true, created: 3, rowErrorCount: 0 });

    const grants = await db().grant.findMany({ orderBy: { purpose: "asc" } });
    expect(grants.map((g) => [g.purpose, g.charityId])).toEqual([
      ["By ID", hilltop.id],
      ["By name", hilltop.id],
      ["By registration number", riverside.id],
    ]);
    const byReg = grants[2];
    expect(byReg).toMatchObject({ categoryId: revenue.id, statusId: awarded.id, createdById: editor.id, updatedById: editor.id });
    expect(byReg.amountRequested.toFixed(2)).toBe("2500.50");
    expect(byReg.amountAgreed?.toFixed(2)).toBe("2000.00");
    expect(byReg.dateSubmitted.toISOString().slice(0, 10)).toBe("2026-01-15");
    expect(byReg.paymentDate?.toISOString().slice(0, 10)).toBe("2026-02-15");
  });

  it("updates grants by ID, keeping columns the file leaves out", async () => {
    const grant = await makeGrant();
    const editor = await signedInAs("EDITOR");
    const result = await upload(csv("ID,Status,Amount agreed,Decision date", `${grant.id},Awarded,20000,2026-04-01`));
    expect(result.summary).toMatchObject({ saved: true, created: 0, updated: 1 });

    const updated = await db().grant.findUniqueOrThrow({ where: { id: grant.id } });
    expect(updated).toMatchObject({ statusId: awarded.id, charityId: riverside.id, categoryId: capital.id, purpose: "Replacement minibus", updatedById: editor.id });
    expect(updated.amountAgreed?.toFixed(2)).toBe("20000.00");
    expect(updated.amountRequested.toFixed(2)).toBe("25000.00");
  });

  it("re-importing an unedited export changes nothing", async () => {
    await makeGrant({ purpose: "=SUM(A1)\nLine two", amountAgreed: "0", decisionDate: d("2026-04-01") });
    await makeGrant({ charityId: hilltop.id, purpose: null, amountRequested: "0.5" });
    const before = await db().grant.findMany({ orderBy: { id: "asc" } });
    await signedInAs("EDITOR");

    const result = await upload(await (await exportCsv()).text());
    expect(result.summary).toMatchObject({ saved: true, created: 0, updated: 0, unchanged: 2, rowErrorCount: 0 });
    expect(await db().grant.findMany({ orderBy: { id: "asc" } })).toEqual(before);
  });

  it("saves nothing when any row is invalid, and says which rows", async () => {
    const grant = await makeGrant();
    await db().charity.create({ data: { name: "Hilltop Trust" } }); // a second one with the same name
    await db().grantCategory.create({ data: { name: "Retired", sortOrder: 3, active: false } });
    await signedInAs("EDITOR");

    const result = await upload(
      csv(
        "ID,Charity,Charity registration number,Category,Status,Date submitted,Amount requested,Amount agreed,Decision date",
        ",Riverside Food Bank,,Capital,Submitted,2026-01-01,100,,", // 2: fine
        ",Nobody,,Capital,Submitted,2026-01-01,100,,", // 3
        ",Hilltop Trust,,Capital,Submitted,2026-01-01,100,,", // 4: ambiguous name
        ",,9999999,Capital,Submitted,2026-01-01,100,,", // 5
        ",Riverside Food Bank,,Gardening,Done,2026-01-01,100,,", // 6
        ",Riverside Food Bank,,Retired,Submitted,2026-01-01,100,,", // 7: inactive
        ",Riverside Food Bank,,Capital,Submitted,31/02/2026,lots,,", // 8
        ",Riverside Food Bank,,Capital,Submitted,2026-01-01,100,50,", // 9: agreed without decision
        "missing,,,,,,,,", // 10
        `${grant.id},,,Capital,Submitted,2026-03-12,25000,,`, // 11: fine (charity kept)
        `${grant.id},,,,Awarded,,,,`, // 12: same grant twice
        ",,,Capital,Submitted,2026-01-01,100,,", // 13: no charity
      ),
    );
    expect(result.summary?.saved).toBe(false);
    const messages = Object.fromEntries(result.summary!.rowErrors.map((e) => [e.row, e.message]));
    expect(Object.keys(messages).map(Number)).toEqual([3, 4, 5, 6, 7, 8, 9, 10, 12, 13]);
    expect(messages[3]).toBe("Charity: No charity is called “Nobody”.");
    expect(messages[4]).toMatch(/2 charities are called “Hilltop Trust”/);
    expect(messages[5]).toBe("Charity: No charity has the registration number 9999999.");
    expect(messages[6]).toBe("Category: no category is called “Gardening”. Status: no status is called “Done”.");
    expect(messages[7]).toBe("Category: “Retired” is inactive.");
    expect(messages[8]).toMatch(/^Date submitted: .* Amount requested: /);
    expect(messages[9]).toBe("Decision date: Enter the decision date for the agreed amount.");
    expect(messages[10]).toMatch(/No grant has the ID “missing”/);
    expect(messages[12]).toBe("Updates the same grant as row 11.");
    expect(messages[13]).toMatch(/^Charity: enter the charity's name/);
    expect(await db().grant.count()).toBe(1);
  });

  it("treats blank cells as clearing the value, which required fields don't allow", async () => {
    const grant = await makeGrant({ amountAgreed: "100", decisionDate: d("2026-04-01") });
    await signedInAs("EDITOR");
    const result = await upload(csv("ID,Charity,Category,Amount agreed,Decision date", `${grant.id},,,,`));
    // Blank charity columns keep the charity; blank optional amounts/dates are cleared.
    expect(result.summary?.rowErrors).toEqual([{ row: 2, message: "Category: Choose a category." }]);
    const ok = await upload(csv("ID,Charity,Amount agreed,Decision date", `${grant.id},,,`));
    expect(ok.summary).toMatchObject({ saved: true, updated: 1 });
    expect(await db().grant.findUniqueOrThrow({ where: { id: grant.id } })).toMatchObject({ charityId: riverside.id, amountAgreed: null, decisionDate: null });
  });

  it("lets an existing grant keep an inactive category", async () => {
    const grant = await makeGrant();
    await db().grantCategory.update({ where: { id: capital.id }, data: { active: false } });
    await signedInAs("EDITOR");
    const result = await upload(csv("ID,Category,Purpose", `${grant.id},Capital,Updated purpose`));
    expect(result.summary).toMatchObject({ saved: true, updated: 1 });
  });

  it("reports problems with the file as a whole", async () => {
    await signedInAs("EDITOR");
    const fileErrors = async (content: string) => (await upload(content)).summary?.fileErrors;
    expect(await fileErrors(csv("Purpose,Colour", "x,y"))).toEqual(["Unrecognised column: “Colour”."]);
    expect(await fileErrors(csv("Purpose", "x"))).toEqual(["The file needs an “ID” column to update grants, or a “Charity” column to add them."]);
  });
});
