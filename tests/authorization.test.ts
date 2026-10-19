import { afterAll, beforeEach, describe, expect, it } from "vitest";
import {
  changeRoleAction,
  createUserAction,
  revokeSessionsAction,
  setActiveAction,
} from "@/app/(app)/admin/users/actions";
import { changePasswordAction } from "@/app/(app)/account/actions";
import { db } from "@/server/db/client";
import { requireAdmin, requireRole, requireUser } from "@/server/authz/guards";
import { changeUserRole, setUserActive, UserManagementError } from "@/server/users/service";
import { expectRedirect, formData, makeUser, PASSWORD, resetDatabase, signIn } from "./support/fixtures";
import { actAs } from "./support/request";

beforeEach(async () => {
  await resetDatabase();
  actAs(null);
});
afterAll(() => db().$disconnect());

const newUserForm = (email = "new.person@example.test") =>
  formData({
    name: "New Person",
    email,
    role: "EDITOR",
    password: "initial password 123",
    confirmPassword: "initial password 123",
  });

describe("guards", () => {
  it("send anonymous visitors to sign-in", async () => {
    await expectRedirect(requireUser(), "/sign-in");
    await expectRedirect(requireRole("VIEWER"), "/sign-in");
  });

  it("send revoked sessions to sign-in", async () => {
    const user = await makeUser();
    const cookie = await signIn(user.email);
    await db().session.deleteMany();
    actAs(cookie);
    await expectRedirect(requireUser(), "/sign-in");
  });

  it("enforce the role hierarchy", async () => {
    const viewer = await makeUser("VIEWER");
    const editor = await makeUser("EDITOR");
    const admin = await makeUser("ADMINISTRATOR");

    actAs(await signIn(viewer.email));
    await expect(requireRole("VIEWER")).resolves.toMatchObject({ id: viewer.id });
    await expectRedirect(requireRole("EDITOR"), "/forbidden");
    await expectRedirect(requireAdmin(), "/forbidden");

    actAs(await signIn(editor.email));
    await expect(requireRole("EDITOR")).resolves.toMatchObject({ id: editor.id });
    await expectRedirect(requireAdmin(), "/forbidden");

    actAs(await signIn(admin.email));
    await expect(requireAdmin()).resolves.toMatchObject({ id: admin.id, role: "ADMINISTRATOR" });
  });

  it("read the role from the database on every request", async () => {
    const admin = await makeUser("ADMINISTRATOR");
    const other = await makeUser("ADMINISTRATOR");
    actAs(await signIn(other.email));
    await expect(requireAdmin()).resolves.toBeTruthy();

    await changeUserRole(other.id, "VIEWER");
    await expectRedirect(requireAdmin(), "/forbidden");
    expect(admin.role).toBe("ADMINISTRATOR");
  });
});

describe("server actions enforce permissions themselves", () => {
  it("reject user creation by anonymous callers, viewers and editors", async () => {
    await expectRedirect(createUserAction({}, newUserForm()), "/sign-in");

    const viewer = await makeUser("VIEWER");
    actAs(await signIn(viewer.email));
    await expectRedirect(createUserAction({}, newUserForm()), "/forbidden");

    const editor = await makeUser("EDITOR");
    actAs(await signIn(editor.email));
    await expectRedirect(createUserAction({}, newUserForm()), "/forbidden");

    expect(await db().user.count({ where: { email: "new.person@example.test" } })).toBe(0);
  });

  it("reject role changes, deactivation and session revocation by non-administrators", async () => {
    const admin = await makeUser("ADMINISTRATOR");
    const editor = await makeUser("EDITOR");
    actAs(await signIn(editor.email));

    // An editor trying to promote themselves or demote/deactivate the admin.
    await expectRedirect(changeRoleAction({}, formData({ userId: editor.id, role: "ADMINISTRATOR" })), "/forbidden");
    await expectRedirect(setActiveAction({}, formData({ userId: admin.id, active: "false" })), "/forbidden");
    await expectRedirect(revokeSessionsAction({}, formData({ userId: admin.id })), "/forbidden");

    const [adminAfter, editorAfter] = await Promise.all([
      db().user.findUniqueOrThrow({ where: { id: admin.id } }),
      db().user.findUniqueOrThrow({ where: { id: editor.id } }),
    ]);
    expect(adminAfter.active).toBe(true);
    expect(editorAfter.role).toBe("EDITOR");
  });

  it("reject password changes without a session", async () => {
    await expectRedirect(
      changePasswordAction({}, formData({ currentPassword: PASSWORD, newPassword: "x".repeat(20), confirmPassword: "x".repeat(20) })),
      "/sign-in",
    );
  });

  it("let administrators create users, with server-side validation and unique emails", async () => {
    const admin = await makeUser("ADMINISTRATOR");
    actAs(await signIn(admin.email));

    const invalid = await createUserAction({}, formData({ name: "", email: "not-an-email", role: "OWNER", password: "short", confirmPassword: "x" }));
    expect(invalid.fieldErrors).toMatchObject({
      name: expect.any(String),
      email: expect.any(String),
      role: expect.any(String),
      password: expect.any(String),
    });
    expect(JSON.stringify(invalid)).not.toContain("short"); // passwords are never echoed back

    await expectRedirect(createUserAction({}, newUserForm()), "/admin/users/[^/;]+\\?created=1");
    const created = await db().user.findUniqueOrThrow({ where: { email: "new.person@example.test" } });
    expect(created.role).toBe("EDITOR");

    const duplicate = await createUserAction({}, newUserForm("  NEW.Person@Example.test"));
    expect(duplicate.fieldErrors?.email).toMatch(/already exists/);
  });

  it("let administrators deactivate users, which revokes their sessions", async () => {
    const admin = await makeUser("ADMINISTRATOR");
    const target = await makeUser("VIEWER");
    await signIn(target.email);
    actAs(await signIn(admin.email));

    const result = await setActiveAction({}, formData({ userId: target.id, active: "false" }));
    expect(result.success).toBeTruthy();
    expect(await db().session.count({ where: { userId: target.id } })).toBe(0);
  });

  it("stop administrators deactivating themselves", async () => {
    const admin = await makeUser("ADMINISTRATOR");
    await makeUser("ADMINISTRATOR");
    actAs(await signIn(admin.email));
    const result = await setActiveAction({}, formData({ userId: admin.id, active: "false" }));
    expect(result.error).toMatch(/own account/);
  });
});

describe("last active administrator", () => {
  it("cannot be demoted", async () => {
    const admin = await makeUser("ADMINISTRATOR");
    actAs(await signIn(admin.email));
    const result = await changeRoleAction({}, formData({ userId: admin.id, role: "VIEWER" }));
    expect(result.error).toMatch(/last active administrator/);
    expect((await db().user.findUniqueOrThrow({ where: { id: admin.id } })).role).toBe("ADMINISTRATOR");
  });

  it("cannot be deactivated", async () => {
    const admin = await makeUser("ADMINISTRATOR");
    await expect(setUserActive(admin.id, false)).rejects.toMatchObject({ code: "LAST_ADMIN" });
  });

  it("deactivated administrators don't count", async () => {
    const a = await makeUser("ADMINISTRATOR");
    const b = await makeUser("ADMINISTRATOR");
    await setUserActive(b.id, false, a.id);
    await expect(changeUserRole(a.id, "EDITOR")).rejects.toBeInstanceOf(UserManagementError);
  });

  it("holds under concurrent demotions", async () => {
    const a = await makeUser("ADMINISTRATOR");
    const b = await makeUser("ADMINISTRATOR");
    const results = await Promise.allSettled([changeUserRole(a.id, "VIEWER"), changeUserRole(b.id, "VIEWER")]);

    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(await db().user.count({ where: { role: "ADMINISTRATOR", active: true } })).toBe(1);
  });

  it("allows demotion when another active administrator exists", async () => {
    const a = await makeUser("ADMINISTRATOR");
    await makeUser("ADMINISTRATOR");
    await expect(changeUserRole(a.id, "EDITOR")).resolves.toMatchObject({ role: "EDITOR" });
  });
});
