import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createCharityAction, deleteCharityAction, updateCharityAction } from "@/app/(app)/charities/actions";
import { CHARITY_PAGE_SIZE, charitySchema, normaliseWebsite } from "@/lib/charities";
import { listCharities } from "@/server/charities/service";
import { db } from "@/server/db/client";
import { expectRedirect, formData, makeUser, resetDatabase, signIn } from "./support/fixtures";
import { actAs } from "./support/request";

beforeEach(async () => {
  await resetDatabase();
  actAs(null);
});
afterAll(() => db().$disconnect());

const charityForm = (overrides: Record<string, string> = {}) =>
  formData({
    name: "Riverside Food Bank",
    registrationNumber: "1234567",
    addressLine1: "1 High Street",
    addressLine2: "",
    town: "Leeds",
    county: "West Yorkshire",
    postcode: "ls1 1aa",
    country: "United Kingdom",
    contactEmail: "Hello@Riverside.example",
    website: "riverside.example",
    ...overrides,
  });

async function signedInAs(role: "VIEWER" | "EDITOR" | "ADMINISTRATOR") {
  const user = await makeUser(role);
  actAs(await signIn(user.email));
  return user;
}

describe("charity validation", () => {
  const base = {
    name: "A",
    registrationNumber: "",
    addressLine1: "",
    addressLine2: "",
    town: "",
    county: "",
    postcode: "",
    country: "",
    contactEmail: "",
    website: "",
  };

  it("normalises values and turns blanks into nulls", () => {
    const parsed = charitySchema.parse({
      ...base,
      name: "  Riverside  ",
      registrationNumber: " sc 012 345 ",
      postcode: " ls1 1aa ",
      contactEmail: " Info@Example.ORG ",
      website: "www.example.org",
    });
    expect(parsed).toMatchObject({
      name: "Riverside",
      registrationNumber: "SC012345",
      postcode: "LS1 1AA",
      contactEmail: "info@example.org",
      website: "https://www.example.org",
      town: null,
      addressLine1: null,
    });
  });

  it("only accepts http(s) websites", () => {
    expect(normaliseWebsite("https://example.org/about?x=1")).toBe("https://example.org/about?x=1");
    expect(normaliseWebsite("http://example.org")).toBe("http://example.org");
    expect(normaliseWebsite("javascript:alert(1)")).toBeNull();
    expect(normaliseWebsite("data:text/html,hi")).toBeNull();
    expect(normaliseWebsite("ftp://example.org")).toBeNull();
    expect(normaliseWebsite("localhost")).toBeNull();
  });

  it("reports field errors", () => {
    const result = charitySchema.safeParse({
      ...base,
      name: " ",
      registrationNumber: "12/34",
      contactEmail: "not-an-email",
      website: "javascript:alert(1)",
    });
    expect(result.success).toBe(false);
    const fields = result.error?.issues.map((i) => i.path[0]);
    expect(fields).toEqual(expect.arrayContaining(["name", "registrationNumber", "contactEmail", "website"]));
  });
});

describe("charity permissions (enforced in the actions)", () => {
  it("anonymous callers are sent to sign-in", async () => {
    await expectRedirect(createCharityAction({}, charityForm()), "/sign-in");
    expect(await db().charity.count()).toBe(0);
  });

  it("viewers cannot create, edit or delete", async () => {
    const editor = await makeUser("EDITOR");
    const existing = await db().charity.create({ data: { name: "Existing", createdById: editor.id } });
    await signedInAs("VIEWER");

    await expectRedirect(createCharityAction({}, charityForm()), "/forbidden");
    await expectRedirect(updateCharityAction({}, charityForm({ id: existing.id, name: "Hacked" })), "/forbidden");
    await expectRedirect(deleteCharityAction({}, formData({ id: existing.id })), "/forbidden");

    expect(await db().charity.findMany({ select: { name: true } })).toEqual([{ name: "Existing" }]);
  });

  it("editors can create and edit, recording who did it, but cannot delete", async () => {
    const editor = await signedInAs("EDITOR");

    await expectRedirect(createCharityAction({}, charityForm()), "/charities/[^/;]+\\?saved=created");
    const created = await db().charity.findFirstOrThrow();
    expect(created).toMatchObject({
      name: "Riverside Food Bank",
      registrationNumber: "1234567",
      postcode: "LS1 1AA",
      contactEmail: "hello@riverside.example",
      website: "https://riverside.example",
      addressLine2: null,
      createdById: editor.id,
      updatedById: editor.id,
    });

    const otherEditor = await signedInAs("EDITOR");
    await expectRedirect(
      updateCharityAction({}, charityForm({ id: created.id, name: "Riverside Community Food Bank", website: "" })),
      `/charities/${created.id}\\?saved=updated`,
    );
    const updated = await db().charity.findUniqueOrThrow({ where: { id: created.id } });
    expect(updated).toMatchObject({ name: "Riverside Community Food Bank", website: null, updatedById: otherEditor.id, createdById: editor.id });

    await expectRedirect(deleteCharityAction({}, formData({ id: created.id })), "/forbidden");
    expect(await db().charity.count()).toBe(1);
  });

  it("administrators can delete", async () => {
    const charity = await db().charity.create({ data: { name: "To remove" } });
    await signedInAs("ADMINISTRATOR");
    await expectRedirect(deleteCharityAction({}, formData({ id: charity.id })), "/charities\\?deleted=1");
    expect(await db().charity.count()).toBe(0);
  });
});

describe("charity data rules", () => {
  it("rejects a duplicate registration number regardless of spacing or case", async () => {
    await signedInAs("EDITOR");
    await expectRedirect(createCharityAction({}, charityForm({ registrationNumber: "sc012345" })), "/charities/[^/;]+\\?saved=created");

    const duplicate = await createCharityAction({}, charityForm({ name: "Other", registrationNumber: "SC 012 345" }));
    expect(duplicate.fieldErrors?.registrationNumber).toMatch(/already has this registration number/);
    expect(duplicate.values?.name).toBe("Other"); // input is kept for correction
  });

  it("allows several charities without a registration number", async () => {
    await signedInAs("EDITOR");
    await expectRedirect(createCharityAction({}, charityForm({ registrationNumber: "" })), "/charities/.+");
    await expectRedirect(createCharityAction({}, charityForm({ name: "Second", registrationNumber: "" })), "/charities/.+");
    expect(await db().charity.count({ where: { registrationNumber: null } })).toBe(2);
  });

  it("returns field errors instead of saving invalid input", async () => {
    await signedInAs("EDITOR");
    const result = await createCharityAction({}, charityForm({ name: "", website: "javascript:alert(1)" }));
    expect(result.fieldErrors).toMatchObject({ name: expect.any(String), website: expect.any(String) });
    expect(await db().charity.count()).toBe(0);
  });

  it("reports editing a charity that no longer exists", async () => {
    await signedInAs("EDITOR");
    const result = await updateCharityAction({}, charityForm({ id: "missing-id" }));
    expect(result.error).toMatch(/not found/i);
  });

  it("keeps the charity when its author's account is removed", async () => {
    const editor = await makeUser("EDITOR");
    await db().charity.create({ data: { name: "Orphan", createdById: editor.id, updatedById: editor.id } });
    await db().user.delete({ where: { id: editor.id } });
    expect(await db().charity.findFirstOrThrow()).toMatchObject({ name: "Orphan", createdById: null, updatedById: null });
  });

  it("searches case-insensitively and paginates", async () => {
    await db().charity.createMany({
      data: Array.from({ length: CHARITY_PAGE_SIZE + 3 }, (_, i) => ({
        name: `Charity ${String(i).padStart(2, "0")}`,
        town: i === 7 ? "York" : "Leeds",
        registrationNumber: `${1000000 + i}`,
      })),
    });

    const page1 = await listCharities();
    expect(page1).toMatchObject({ total: CHARITY_PAGE_SIZE + 3, page: 1, pageCount: 2 });
    expect(page1.items).toHaveLength(CHARITY_PAGE_SIZE);
    expect((await listCharities({ page: 2 })).items).toHaveLength(3);
    expect((await listCharities({ page: 99 })).page).toBe(2); // clamped

    expect((await listCharities({ query: "york" })).items.map((c) => c.name)).toEqual(["Charity 07"]);
    expect((await listCharities({ query: "1000012" })).items.map((c) => c.name)).toEqual(["Charity 12"]);
    expect((await listCharities({ query: "no such thing" })).total).toBe(0);
  });

  it("treats search input as plain text (quotes, wildcards, Unicode)", async () => {
    await db().charity.createMany({
      data: [{ name: "St Mary's Trust" }, { name: "100% Kids" }, { name: "Café Ünited" }, { name: "Other" }],
    });
    const names = async (query: string) => (await listCharities({ query })).items.map((c) => c.name);

    expect(await names("mary's")).toEqual(["St Mary's Trust"]);
    expect(await names("%")).toEqual(["100% Kids"]); // not a wildcard
    expect(await names("_")).toEqual([]);
    expect(await names("café")).toEqual(["Café Ünited"]);
    expect(await names("'; DROP TABLE charities; --")).toEqual([]);
    expect(await db().charity.count()).toBe(4);
  });
});
