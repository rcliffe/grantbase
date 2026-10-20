import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { decideGrantAction, markGrantPaidAction } from "@/app/(app)/grants/actions";
import { createLookupAction, updateLookupAction } from "@/app/(app)/settings/_grant-lookups/actions";
import type { Prisma } from "@/generated/prisma/client";
import { todayInUk } from "@/lib/grant-process";
import { db } from "@/server/db/client";
import { decideGrant, listAwaitingDecision, listAwaitingPayment } from "@/server/grants/process";
import { expectRedirect, formData, makeUser, resetDatabase, signIn } from "./support/fixtures";
import { actAs } from "./support/request";

const d = (iso: string) => new Date(`${iso}T00:00:00Z`);
const iso = (date: Date | null) => date?.toISOString().slice(0, 10) ?? null;

let charityId: string;
let categoryId: string;
const status: Record<string, string> = {};

beforeEach(async () => {
  await resetDatabase();
  actAs(null);
  charityId = (await db().charity.create({ data: { name: "Riverside Food Bank" } })).id;
  categoryId = (await db().grantCategory.create({ data: { name: "Capital", sortOrder: 1 } })).id;
  const statuses: [string, Prisma.GrantStatusCreateInput["stage"]][] = [
    ["Draft", null],
    ["Submitted", "SUBMITTED"],
    ["Under review", "SUBMITTED"],
    ["Awarded", "APPROVED"],
    ["Paid", "PAID"],
    ["Declined", "REJECTED"],
  ];
  for (const [i, [name, stage]] of statuses.entries()) {
    status[name] = (await db().grantStatus.create({ data: { name, stage, sortOrder: i + 1 } })).id;
  }
});
afterAll(() => db().$disconnect());

async function signedInAs(role: "VIEWER" | "EDITOR" | "ADMINISTRATOR") {
  const user = await makeUser(role);
  actAs(await signIn(user.email));
  return user;
}

function makeGrant(overrides: Partial<Prisma.GrantUncheckedCreateInput> = {}) {
  return db().grant.create({
    data: { charityId, categoryId, statusId: status.Submitted, dateSubmitted: d("2026-03-12"), amountRequested: "25000", ...overrides },
  });
}

const decide = (id: string, decision: string, fields: Record<string, string> = {}) =>
  decideGrantAction({}, formData({ id, decision, amountAgreed: "20000", decisionDate: "2026-04-01", ...fields }));
const pay = (id: string, paymentDate = "2026-04-20") => markGrantPaidAction({}, formData({ id, paymentDate }));
const reload = (id: string) => db().grant.findUniqueOrThrow({ where: { id } });

describe("today's date", () => {
  it("uses the UK date, including during British Summer Time", () => {
    expect(todayInUk(new Date("2026-06-30T23:30:00Z"))).toBe("2026-07-01"); // 00:30 BST
    expect(todayInUk(new Date("2026-12-31T23:30:00Z"))).toBe("2026-12-31"); // GMT
  });
});

describe("process queues", () => {
  it("lists grants awaiting a decision, oldest first, across all statuses at that stage", async () => {
    const later = await makeGrant({ dateSubmitted: d("2026-05-01") });
    const earlier = await makeGrant({ dateSubmitted: d("2026-01-01"), statusId: status["Under review"] });
    await makeGrant({ statusId: status.Draft });
    await makeGrant({ statusId: status.Awarded, amountAgreed: "1", decisionDate: d("2026-04-01") });
    expect((await listAwaitingDecision()).map((g) => g.id)).toEqual([earlier.id, later.id]);
  });

  it("lists approved grants that haven't been paid, oldest decision first", async () => {
    const approved = { statusId: status.Awarded, amountAgreed: "100" };
    const later = await makeGrant({ ...approved, decisionDate: d("2026-05-01") });
    const earlier = await makeGrant({ ...approved, decisionDate: d("2026-04-01") });
    await makeGrant({ ...approved, decisionDate: d("2026-04-01"), paymentDate: d("2026-04-02") });
    await makeGrant();
    expect((await listAwaitingPayment()).map((g) => g.id)).toEqual([earlier.id, later.id]);
  });
});

describe("approving and rejecting", () => {
  it("only editors and above can decide or pay", async () => {
    const grant = await makeGrant();
    await expectRedirect(decide(grant.id, "approve"), "/sign-in");
    await signedInAs("VIEWER");
    await expectRedirect(decide(grant.id, "approve"), "/forbidden");
    await expectRedirect(pay(grant.id), "/forbidden");
    expect((await reload(grant.id)).statusId).toBe(status.Submitted);
  });

  it("approves with the amount agreed and decision date", async () => {
    const grant = await makeGrant({ statusId: status["Under review"] });
    const editor = await signedInAs("EDITOR");
    await expectRedirect(decide(grant.id, "approve", { amountAgreed: "£20,000.50" }), `/grants/decisions\\?approved=${grant.id}`);
    const after = await reload(grant.id);
    expect(after).toMatchObject({ statusId: status.Awarded, updatedById: editor.id });
    expect(after.amountAgreed?.toFixed(2)).toBe("20000.50");
    expect(iso(after.decisionDate)).toBe("2026-04-01");
  });

  it("rejects, recording £0 agreed", async () => {
    const grant = await makeGrant();
    await signedInAs("EDITOR");
    await expectRedirect(decide(grant.id, "reject", { amountAgreed: "999" }), `/grants/decisions\\?rejected=${grant.id}`);
    const after = await reload(grant.id);
    expect(after.statusId).toBe(status.Declined);
    expect(after.amountAgreed?.toFixed(2)).toBe("0.00");
  });

  it("applies the grant form's rules", async () => {
    const grant = await makeGrant();
    await signedInAs("EDITOR");
    expect((await decide(grant.id, "approve", { amountAgreed: "" })).fieldErrors?.amountAgreed).toMatch(/Enter the amount agreed/);
    expect((await decide(grant.id, "approve", { amountAgreed: "0" })).fieldErrors?.amountAgreed).toMatch(/reject it instead/);
    expect((await decide(grant.id, "approve", { amountAgreed: "lots" })).fieldErrors?.amountAgreed).toMatch(/in pounds/);
    expect((await decide(grant.id, "approve", { decisionDate: "2026-03-11" })).fieldErrors?.decisionDate).toMatch(/before the date submitted/);
    const missingDate = await decide(grant.id, "reject", { decisionDate: "" });
    expect(missingDate.fieldErrors?.decisionDate).toBeDefined();
    expect(missingDate.values).toEqual({ amountAgreed: "20000", decisionDate: "" }); // kept for correction
    expect((await reload(grant.id)).statusId).toBe(status.Submitted);
  });

  it("refuses to decide a grant twice", async () => {
    const grant = await makeGrant();
    await signedInAs("EDITOR");
    await expectRedirect(decide(grant.id, "approve"), "/grants/decisions.*");
    expect((await decide(grant.id, "reject")).error).toMatch(/already been decided: its status is now “Awarded”/);
    expect((await reload(grant.id)).statusId).toBe(status.Awarded);
  });

  it("lets only one of two simultaneous decisions through", async () => {
    const grant = await makeGrant();
    const editor = await makeUser("EDITOR");
    const results = await Promise.allSettled([
      decideGrant(grant.id, "approve", { amountAgreed: "100", decisionDate: "2026-04-01" }, editor.id),
      decideGrant(grant.id, "reject", { amountAgreed: "", decisionDate: "2026-04-01" }, editor.id),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual(["fulfilled", "rejected"]);
    const after = await reload(grant.id);
    expect([status.Awarded, status.Declined]).toContain(after.statusId);
  });

  it("explains when no status is set up for the outcome", async () => {
    await db().grantStatus.update({ where: { id: status.Awarded }, data: { active: false } });
    const grant = await makeGrant();
    await signedInAs("EDITOR");
    expect((await decide(grant.id, "approve")).error).toMatch(/No active status has the “Approved” stage/);
  });

  it("uses the first active status for the stage, in list order", async () => {
    await db().grantStatus.create({ data: { name: "Approved (conditions)", stage: "APPROVED", sortOrder: 0 } });
    const grant = await makeGrant();
    await signedInAs("EDITOR");
    await expectRedirect(decide(grant.id, "approve"), "/grants/decisions.*");
    expect((await db().grant.findUniqueOrThrow({ where: { id: grant.id }, include: { status: true } })).status.name).toBe("Approved (conditions)");
  });
});

describe("marking as paid", () => {
  const approved = () => makeGrant({ statusId: status.Awarded, amountAgreed: "20000", decisionDate: d("2026-04-01") });

  it("records the payment date and moves the grant to the paid status", async () => {
    const grant = await approved();
    const editor = await signedInAs("EDITOR");
    await expectRedirect(pay(grant.id), `/grants/payments\\?paid=${grant.id}`);
    const after = await reload(grant.id);
    expect(after).toMatchObject({ statusId: status.Paid, updatedById: editor.id });
    expect(iso(after.paymentDate)).toBe("2026-04-20");
    expect(await listAwaitingPayment()).toEqual([]);
  });

  it("keeps the status when no status has the Paid stage", async () => {
    await db().grantStatus.update({ where: { id: status.Paid }, data: { stage: null } });
    const grant = await approved();
    await signedInAs("EDITOR");
    await expectRedirect(pay(grant.id), "/grants/payments.*");
    const after = await reload(grant.id);
    expect(after.statusId).toBe(status.Awarded);
    expect(iso(after.paymentDate)).toBe("2026-04-20");
    expect(await listAwaitingPayment()).toEqual([]); // paid grants leave the queue either way
  });

  it("checks dates and refuses grants that aren't approved or are already paid", async () => {
    const grant = await approved();
    await signedInAs("EDITOR");
    expect((await pay(grant.id, "2026-03-31")).fieldErrors?.paymentDate).toMatch(/before the decision date/);
    expect((await pay(grant.id, "")).fieldErrors?.paymentDate).toMatch(/Enter the payment date/);
    await expectRedirect(pay(grant.id), "/grants/payments.*");
    expect((await pay(grant.id)).error).toMatch(/already been marked as paid/);

    const submitted = await makeGrant();
    expect((await pay(submitted.id)).error).toMatch(/Only approved grants can be paid/);
  });
});

describe("process stages in settings", () => {
  beforeEach(() => signedInAs("ADMINISTRATOR"));

  it("saves a stage for statuses and ignores it for categories", async () => {
    const entry = (fields: Record<string, string>) => formData({ description: "", tone: "neutral", active: "on", ...fields });
    expect((await createLookupAction("status", {}, entry({ name: "On hold", stage: "SUBMITTED" }))).success).toBeDefined();
    expect((await db().grantStatus.findUniqueOrThrow({ where: { name: "On hold" } })).stage).toBe("SUBMITTED");

    await expectRedirect(updateLookupAction("status", {}, entry({ id: status.Draft, name: "Draft", stage: "" })), "/settings/grant-statuses.*");
    expect((await db().grantStatus.findUniqueOrThrow({ where: { id: status.Draft } })).stage).toBeNull();

    expect((await createLookupAction("category", {}, entry({ name: "Revenue", stage: "PAID" }))).success).toBeDefined();
    expect((await createLookupAction("status", {}, entry({ name: "Odd", stage: "LOST" }))).fieldErrors?.stage).toBe("Choose a stage.");
  });
});
