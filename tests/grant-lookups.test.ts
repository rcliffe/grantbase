import { afterAll, beforeEach, describe, expect, it } from "vitest";
import {
  addStandardStatusesAction,
  createLookupAction,
  deleteLookupAction,
  moveLookupAction,
  updateLookupAction,
} from "@/app/(app)/settings/_grant-lookups/actions";
import { lookupSchema, STANDARD_GRANT_STATUSES, type LookupKind } from "@/lib/grant-lookups";
import { listLookups } from "@/server/grant-lookups/service";
import { db } from "@/server/db/client";
import { expectRedirect, formData, makeUser, resetDatabase, signIn } from "./support/fixtures";
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

const entry = (overrides: Record<string, string> = {}) =>
  formData({ name: "Capital", description: "Buildings and equipment", tone: "accent", active: "on", ...overrides });

const names = async (kind: LookupKind) => (await listLookups(kind)).map((i) => i.name);

async function add(kind: LookupKind, ...list: string[]) {
  for (const name of list) {
    expect((await createLookupAction(kind, {}, entry({ name }))).success).toBeDefined();
  }
  return listLookups(kind);
}

describe("grant lookup validation", () => {
  it("trims values, blanks the description and reads the checkbox", () => {
    expect(lookupSchema.parse({ name: "  Revenue ", description: "  ", tone: "success" })).toEqual({
      name: "Revenue",
      description: null,
      tone: "success",
      stage: null,
      active: false, // unticked checkboxes aren't submitted
    });
    expect(lookupSchema.parse({ name: "A", description: "", tone: "neutral", active: "on" }).active).toBe(true);
  });

  it("rejects missing names, long text and unknown colours", () => {
    const result = lookupSchema.safeParse({ name: " ", description: "x".repeat(501), tone: "purple" });
    expect(result.error?.issues.map((i) => i.path[0])).toEqual(expect.arrayContaining(["name", "description", "tone"]));
  });

  it("allows names of up to 255 characters", () => {
    expect(lookupSchema.safeParse({ name: "x".repeat(255), description: "", tone: "neutral" }).success).toBe(true);
    expect(lookupSchema.safeParse({ name: "x".repeat(256), description: "", tone: "neutral" }).error?.issues[0].message).toBe(
      "Name must be at most 255 characters.",
    );
  });
});

describe("grant lookup permissions", () => {
  it("only administrators can change the lists", async () => {
    await expectRedirect(createLookupAction("category", {}, entry()), "/sign-in");
    await signedInAs("EDITOR");
    await expectRedirect(createLookupAction("category", {}, entry()), "/forbidden");
    await expectRedirect(addStandardStatusesAction(), "/forbidden");
    const existing = await db().grantStatus.create({ data: { name: "Draft", sortOrder: 1 } });
    await expectRedirect(updateLookupAction("status", {}, entry({ id: existing.id })), "/forbidden");
    await expectRedirect(moveLookupAction("status", {}, formData({ id: existing.id, direction: "down" })), "/forbidden");
    await expectRedirect(deleteLookupAction("status", {}, formData({ id: existing.id })), "/forbidden");
    expect(await db().grantCategory.count()).toBe(0);
    expect(await db().grantStatus.count()).toBe(1);
  });

  it("rejects a list kind that isn't category or status", async () => {
    await signedInAs("ADMINISTRATOR");
    await expect(createLookupAction("user" as LookupKind, {}, entry())).rejects.toThrow(/Invalid list/);
  });
});

describe("maintaining grant categories and statuses", () => {
  beforeEach(() => signedInAs("ADMINISTRATOR"));

  it("adds entries to the end of the right list", async () => {
    await add("category", "Capital", "Revenue");
    await add("status", "Draft");
    expect(await names("category")).toEqual(["Capital", "Revenue"]);
    expect(await names("status")).toEqual(["Draft"]);
    const long = `Education, training and employment ${"x".repeat(220)}`;
    await add("category", long);
    expect(await names("category")).toContain(long);
    expect(await db().grantCategory.findFirstOrThrow({ where: { name: "Capital" } })).toMatchObject({
      description: "Buildings and equipment",
      tone: "accent",
      active: true,
      sortOrder: 1,
    });
  });

  it("rejects duplicate names regardless of case, keeping the input", async () => {
    await add("category", "Capital");
    const result = await createLookupAction("category", {}, entry({ name: "CAPITAL", description: "Other" }));
    expect(result.fieldErrors?.name).toMatch(/already a category with this name/);
    expect(result.values?.description).toBe("Other");
    // The same name in the other list is fine.
    expect((await createLookupAction("status", {}, entry({ name: "Capital" }))).success).toBeDefined();
  });

  it("edits and deactivates an entry", async () => {
    const [item] = await add("status", "Submitted");
    await expectRedirect(
      updateLookupAction("status", {}, formData({ id: item.id, name: "Received", description: "", tone: "warning" })),
      "/settings/grant-statuses\\?saved=1",
    );
    expect(await db().grantStatus.findUniqueOrThrow({ where: { id: item.id } })).toMatchObject({
      name: "Received",
      description: null,
      tone: "warning",
      active: false,
    });
    expect(await listLookups("status", { activeOnly: true })).toEqual([]);
  });

  it("reports editing or moving an entry that no longer exists", async () => {
    expect((await updateLookupAction("category", {}, entry({ id: "missing" }))).error).toMatch(/no longer exists/);
    expect((await moveLookupAction("category", {}, formData({ id: "missing", direction: "up" }))).error).toMatch(/no longer exists/);
    expect((await deleteLookupAction("category", {}, formData({ id: "missing" }))).error).toMatch(/no longer exists/);
  });

  it("reorders entries and ignores moves past either end", async () => {
    const [a, , c] = await add("category", "A", "B", "C");
    const move = (id: string, direction: string) => moveLookupAction("category", {}, formData({ id, direction }));

    await move(c.id, "up");
    expect(await names("category")).toEqual(["A", "C", "B"]);
    await move(a.id, "down");
    expect(await names("category")).toEqual(["C", "A", "B"]);
    await move(c.id, "up"); // already first
    expect(await names("category")).toEqual(["C", "A", "B"]);
    expect((await move(a.id, "sideways")).error).toBe("Invalid request.");
  });

  it("repairs gaps and ties in the order when moving", async () => {
    await db().grantStatus.createMany({
      data: [
        { name: "X", sortOrder: 10 },
        { name: "Y", sortOrder: 10 },
        { name: "Z", sortOrder: 40 },
      ],
    });
    const z = await db().grantStatus.findFirstOrThrow({ where: { name: "Z" } });
    await moveLookupAction("status", {}, formData({ id: z.id, direction: "up" }));
    expect((await listLookups("status")).map((i) => [i.name, i.sortOrder])).toEqual([
      ["X", 1],
      ["Z", 2],
      ["Y", 3],
    ]);
  });

  it("deletes an entry", async () => {
    const [item] = await add("category", "Capital");
    await expectRedirect(deleteLookupAction("category", {}, formData({ id: item.id })), "/settings/grant-categories\\?deleted=1");
    expect(await db().grantCategory.count()).toBe(0);
  });

  it("adds the standard statuses only while the list is empty", async () => {
    expect((await addStandardStatusesAction()).success).toBe(`Added ${STANDARD_GRANT_STATUSES.length} standard statuses.`);
    expect(await names("status")).toEqual(STANDARD_GRANT_STATUSES.map((s) => s.name));
    expect((await addStandardStatusesAction()).error).toMatch(/only be added while the list is empty/);
    expect(await db().grantStatus.count()).toBe(STANDARD_GRANT_STATUSES.length);
  });
});
