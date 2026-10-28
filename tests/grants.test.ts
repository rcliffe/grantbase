import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { deleteLookupAction } from "@/app/(app)/settings/_grant-lookups/actions";
import { deleteCharityAction } from "@/app/(app)/charities/actions";
import { createGrantAction, deleteGrantAction, updateGrantAction } from "@/app/(app)/grants/actions";
import { formatDate, formatMoney, grantSchema, parseAmount, purposeSummary } from "@/lib/grants";
import { db } from "@/server/db/client";
import { getGrantFormOptions, listGrants, listGrantsForCharity } from "@/server/grants/service";
import { expectRedirect, formData, makeUser, resetDatabase, signIn } from "./support/fixtures";
import { actAs } from "./support/request";

let charityId: string;
let categoryId: string;
let statusId: string;

beforeEach(async () => {
  await resetDatabase();
  actAs(null);
  charityId = (await db().charity.create({ data: { name: "Riverside Food Bank", registrationNumber: "1234567" } })).id;
  categoryId = (await db().grantCategory.create({ data: { name: "Capital", sortOrder: 1 } })).id;
  statusId = (await db().grantStatus.create({ data: { name: "Submitted", sortOrder: 1 } })).id;
});
afterAll(() => db().$disconnect());

async function signedInAs(role: "VIEWER" | "EDITOR" | "ADMINISTRATOR") {
  const user = await makeUser(role);
  actAs(await signIn(user.email));
  return user;
}

const values = (overrides: Record<string, string> = {}) => ({
  charityId,
  categoryId,
  statusId,
  purpose: "Replacement minibus",
  dateSubmitted: "2026-03-12",
  amountRequested: "£25,000",
  amountAgreed: "",
  decisionDate: "",
  paymentDate: "",
  accountsDate: "",
  income: "",
  expenditure: "",
  governmentFunding: "",
  otherFunders: "",
  penceInPound: "",
  employees: "",
  volunteers: "",
  trustees: "",
  ...overrides,
});
const grantForm = (overrides: Record<string, string> = {}) => formData(values(overrides));

async function createGrant(overrides: Record<string, string> = {}) {
  await expectRedirect(createGrantAction({}, grantForm(overrides)), "/grants/[^/;]+\\?saved=created");
  return db().grant.findFirstOrThrow({ orderBy: { createdAt: "desc" } });
}

describe("grant validation", () => {
  it("parses amounts in pounds exactly", () => {
    expect(parseAmount("2500")).toBe("2500.00");
    expect(parseAmount("£2,500.5")).toBe("2500.50");
    expect(parseAmount(" 1 234.56 ")).toBe("1234.56");
    expect(parseAmount("0")).toBe("0.00");
    expect(parseAmount("007.10")).toBe("7.10");
    expect(parseAmount("9999999999.99")).toBe("9999999999.99");
    for (const bad of ["", "-5", "1.234", "12a", "1e3", "£", "10000000000", "1,2.3.4"]) {
      expect(parseAmount(bad), bad).toBeNull();
    }
  });

  it("formats money and dates for display", () => {
    expect(formatMoney("25000.00")).toBe("£25,000.00");
    expect(formatDate(new Date("2026-03-12T00:00:00Z"))).toBe("12 Mar 2026");
  });

  it("normalises values and requires the core fields", () => {
    expect(grantSchema.parse(values({ purpose: "  " }))).toMatchObject({ purpose: null, amountRequested: "25000.00", amountAgreed: null, decisionDate: null });

    const result = grantSchema.safeParse(values({ charityId: "", categoryId: "", statusId: "", dateSubmitted: "", amountRequested: "" }));
    expect(result.error?.issues.map((i) => i.path[0])).toEqual(
      expect.arrayContaining(["charityId", "categoryId", "statusId", "dateSubmitted", "amountRequested"]),
    );
  });

  it("allows a purpose of up to 4,000 characters, keeping line breaks", () => {
    const long = `Line one\n${"x".repeat(3991)}`;
    expect(long).toHaveLength(4000);
    expect(grantSchema.parse(values({ purpose: long })).purpose).toBe(long);
    expect(grantSchema.safeParse(values({ purpose: `${long}x` })).error?.issues[0].message).toBe("Purpose must be at most 4,000 characters.");
  });

  it("summarises the purpose as its first line", () => {
    expect(purposeSummary("Minibus\nDetails follow")).toBe("Minibus");
    expect(purposeSummary("a".repeat(100))).toBe(`${"a".repeat(79)}…`);
  });

  it("rejects impossible dates", () => {
    for (const bad of ["2026-02-30", "12/03/2026", "1899-12-31", "2026-13-01"]) {
      expect(grantSchema.safeParse(values({ dateSubmitted: bad })).success, bad).toBe(false);
    }
  });

  it("keeps the dates and amounts consistent", () => {
    const issues = (overrides: Record<string, string>) =>
      grantSchema.safeParse(values(overrides)).error?.issues.map((i) => `${String(i.path[0])}: ${i.message}`) ?? [];

    expect(issues({ decisionDate: "2026-03-11" })).toEqual(["decisionDate: The decision date can't be before the date submitted."]);
    expect(issues({ amountAgreed: "20000" })).toEqual(["decisionDate: Enter the decision date for the agreed amount."]);
    expect(issues({ paymentDate: "2026-05-01" })).toEqual(["paymentDate: A payment date needs an agreed amount above zero."]);
    expect(issues({ amountAgreed: "0", decisionDate: "2026-04-01", paymentDate: "2026-05-01" })).toEqual([
      "paymentDate: A payment date needs an agreed amount above zero.",
    ]);
    expect(issues({ amountAgreed: "20000", decisionDate: "2026-04-01", paymentDate: "2026-03-31" })).toEqual([
      "paymentDate: The payment date can't be before the decision date.",
    ]);
    expect(issues({ amountAgreed: "20000", decisionDate: "2026-04-01", paymentDate: "2026-04-01" })).toEqual([]);
    // Declined: a decision with nothing agreed.
    expect(issues({ amountAgreed: "0", decisionDate: "2026-04-01" })).toEqual([]);
  });
});

describe("grant permissions", () => {
  it("anonymous callers are sent to sign-in", async () => {
    await expectRedirect(createGrantAction({}, grantForm()), "/sign-in");
  });

  it("viewers can't create, edit or delete", async () => {
    const grant = await db().grant.create({
      data: { charityId, categoryId, statusId, dateSubmitted: new Date("2026-01-01T00:00:00Z"), amountRequested: "100" },
    });
    await signedInAs("VIEWER");
    await expectRedirect(createGrantAction({}, grantForm()), "/forbidden");
    await expectRedirect(updateGrantAction({}, grantForm({ id: grant.id, amountRequested: "1" })), "/forbidden");
    await expectRedirect(deleteGrantAction({}, formData({ id: grant.id })), "/forbidden");
    expect((await db().grant.findFirstOrThrow()).amountRequested.toFixed(2)).toBe("100.00");
  });

  it("editors can create and edit, recording who did it, but can't delete", async () => {
    const editor = await signedInAs("EDITOR");
    const purpose = `Replacement minibus\n${"Detail. ".repeat(450)}`.trim();
    const created = await createGrant({ purpose });
    expect(created).toMatchObject({ charityId, categoryId, statusId, purpose, createdById: editor.id, updatedById: editor.id });
    expect(created.amountRequested.toFixed(2)).toBe("25000.00");
    // Stored as a calendar date: no time-zone shift.
    expect(created.dateSubmitted.toISOString()).toBe("2026-03-12T00:00:00.000Z");

    const other = await signedInAs("EDITOR");
    await expectRedirect(
      updateGrantAction(
        {},
        grantForm({ id: created.id, amountAgreed: "20,000.50", decisionDate: "2026-04-01", paymentDate: "2026-04-15", purpose: "" }),
      ),
      `/grants/${created.id}\\?saved=updated`,
    );
    const updated = await db().grant.findUniqueOrThrow({ where: { id: created.id } });
    expect(updated).toMatchObject({ purpose: null, updatedById: other.id, createdById: editor.id });
    expect(updated.amountAgreed?.toFixed(2)).toBe("20000.50");
    expect(updated.paymentDate?.toISOString().slice(0, 10)).toBe("2026-04-15");

    await expectRedirect(deleteGrantAction({}, formData({ id: created.id })), "/forbidden");
    expect(await db().grant.count()).toBe(1);
  });

  it("administrators can delete", async () => {
    await signedInAs("ADMINISTRATOR");
    const grant = await createGrant();
    await expectRedirect(deleteGrantAction({}, formData({ id: grant.id })), "/grants\\?deleted=1");
    expect(await db().grant.count()).toBe(0);
  });
});

describe("grant data rules", () => {
  beforeEach(() => signedInAs("EDITOR"));

  it("returns field errors and keeps the input instead of saving invalid data", async () => {
    const result = await createGrantAction({}, grantForm({ amountRequested: "lots", dateSubmitted: "" }));
    expect(result.fieldErrors).toMatchObject({ amountRequested: expect.any(String), dateSubmitted: expect.any(String) });
    expect(result.values?.purpose).toBe("Replacement minibus");
    expect(await db().grant.count()).toBe(0);
  });

  it("rejects a charity, category or status that doesn't exist", async () => {
    expect((await createGrantAction({}, grantForm({ charityId: "missing" }))).fieldErrors?.charityId).toMatch(/no longer exists/);
    expect((await createGrantAction({}, grantForm({ categoryId: "missing" }))).fieldErrors?.categoryId).toMatch(/active category/);
    expect((await createGrantAction({}, grantForm({ statusId: "missing" }))).fieldErrors?.statusId).toMatch(/active status/);
    expect(await db().grant.count()).toBe(0);
  });

  it("only offers active categories and statuses, but lets a grant keep an inactive one", async () => {
    const grant = await createGrant();
    await db().grantCategory.update({ where: { id: categoryId }, data: { active: false } });
    const retired = await db().grantStatus.create({ data: { name: "Retired", sortOrder: 2, active: false } });

    expect((await createGrantAction({}, grantForm())).fieldErrors?.categoryId).toMatch(/active category/);
    // Editing other fields of a grant whose category was deactivated still works.
    await expectRedirect(updateGrantAction({}, grantForm({ id: grant.id, purpose: "Minibus" })), `/grants/${grant.id}.*`);
    // But it can't be moved to a different inactive status.
    expect((await updateGrantAction({}, grantForm({ id: grant.id, statusId: retired.id }))).fieldErrors?.statusId).toMatch(/active status/);

    expect((await getGrantFormOptions()).categories).toEqual([]);
    const editing = await getGrantFormOptions({ categoryId, statusId });
    expect(editing.categories.map((c) => [c.name, c.active])).toEqual([["Capital", false]]);
    expect(editing.statuses.map((s) => s.name)).toEqual(["Submitted"]);
  });

  it("reports editing a grant that no longer exists", async () => {
    expect((await updateGrantAction({}, grantForm({ id: "missing" }))).error).toMatch(/not found/i);
  });

  it("filters, searches and totals grants", async () => {
    const other = await db().charity.create({ data: { name: "Hilltop Trust" } });
    const awarded = await db().grantStatus.create({ data: { name: "Awarded", sortOrder: 2 } });
    await createGrant({ amountRequested: "1000.10", dateSubmitted: "2026-01-01" });
    await createGrant({ amountRequested: "2000.20", amountAgreed: "1500.05", decisionDate: "2026-02-01", statusId: awarded.id, dateSubmitted: "2026-01-15" });
    await createGrant({ charityId: other.id, amountRequested: "300", purpose: "Roof repairs", dateSubmitted: "2026-02-01" });

    const all = await listGrants();
    expect(all.totals).toEqual({ count: 3, requested: "3300.30", agreed: "1500.05" });
    expect(all.items.map((g) => g.dateSubmitted.toISOString().slice(0, 10))).toEqual(["2026-02-01", "2026-01-15", "2026-01-01"]);
    const oldest = await listGrants({ order: "oldest" });
    expect(oldest.items.map((g) => g.dateSubmitted.toISOString().slice(0, 10))).toEqual(["2026-01-01", "2026-01-15", "2026-02-01"]);

    expect((await listGrants({ statusId: awarded.id })).totals).toMatchObject({ count: 1, requested: "2000.20" });
    expect((await listGrants({ query: "hilltop" })).items.map((g) => g.purpose)).toEqual(["Roof repairs"]);
    expect((await listGrants({ query: "roof" })).totals.count).toBe(1);
    expect((await listGrants({ query: "1234567" })).totals.count).toBe(2); // registration number
    expect((await listGrants({ query: "%" })).totals.count).toBe(0); // not a wildcard

    // Date submitted range, both ends included.
    const received = async (dateFrom: string, dateTo: string) =>
      (await listGrants({ dateFrom, dateTo })).items.map((g) => g.dateSubmitted.toISOString().slice(0, 10));
    expect(await received("2026-01-15", "2026-02-01")).toEqual(["2026-02-01", "2026-01-15"]);
    expect(await received("2026-01-02", "")).toEqual(["2026-02-01", "2026-01-15"]);
    expect(await received("", "2026-01-14")).toEqual(["2026-01-01"]);
    expect(await received("2026-01-15", "2026-01-15")).toEqual(["2026-01-15"]);
    expect(await received("not a date", "2026-02-30")).toHaveLength(3); // ignored
    expect((await listGrants({ dateFrom: "2026-01-10", statusId: awarded.id })).totals.count).toBe(1);
    expect(await listGrantsForCharity(other.id)).toHaveLength(1);
  });

  it("pages grants 10, 25 or 50 at a time", async () => {
    for (let day = 1; day <= 12; day++) await createGrant({ dateSubmitted: `2026-03-${String(day).padStart(2, "0")}` });
    expect(await listGrants()).toMatchObject({ page: 1, pageCount: 1, pageSize: 25 });
    const last = await listGrants({ pageSize: 10, page: 2 });
    expect(last).toMatchObject({ page: 2, pageCount: 2, pageSize: 10, totals: { count: 12 } });
    expect(last.items.map((g) => g.dateSubmitted.getUTCDate())).toEqual([2, 1]);
    expect((await listGrants({ pageSize: 7 })).pageSize).toBe(25);
  });
});

describe("records that grants depend on", () => {
  it("a charity with grants can't be deleted", async () => {
    await signedInAs("ADMINISTRATOR");
    await createGrant();
    const result = await deleteCharityAction({}, formData({ id: charityId }));
    expect(result.error).toMatch(/has grants/);
    expect(await db().charity.count()).toBe(1);
  });

  it("a category or status in use can't be deleted", async () => {
    await signedInAs("ADMINISTRATOR");
    await createGrant();
    expect((await deleteLookupAction("category", {}, formData({ id: categoryId }))).error).toMatch(/in use.*Deactivate/);
    expect((await deleteLookupAction("status", {}, formData({ id: statusId }))).error).toMatch(/in use/);
    expect(await db().grantCategory.count()).toBe(1);
  });
});
