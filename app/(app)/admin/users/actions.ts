"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import type { FormState } from "@/lib/form-state";
import { createUserSchema, fieldErrorsFrom, roleSchema, userIdSchema } from "@/lib/validation";
import { requireAdmin } from "@/server/authz/guards";
import {
  changeUserRole,
  createUser,
  revokeAllSessions,
  setUserActive,
  UserManagementError,
} from "@/server/users/service";

/*
 * Every action re-checks the caller's role on the server, first thing. The pages that
 * render these forms are also admin-only, but actions are public HTTP endpoints and
 * can be invoked directly.
 */

function errorState(error: unknown): FormState {
  if (error instanceof UserManagementError) {
    return error.code === "EMAIL_TAKEN" ? { fieldErrors: { email: error.message } } : { error: error.message };
  }
  throw error;
}

export async function createUserAction(_prev: FormState, formData: FormData): Promise<FormState> {
  await requireAdmin();

  const values = {
    name: String(formData.get("name") ?? ""),
    email: String(formData.get("email") ?? ""),
    role: String(formData.get("role") ?? ""),
  };
  const parsed = createUserSchema.safeParse({
    ...values,
    password: formData.get("password"),
    confirmPassword: formData.get("confirmPassword"),
  });
  if (!parsed.success) return { fieldErrors: fieldErrorsFrom(parsed.error), values };

  let id: string;
  try {
    const { name, email, role, password } = parsed.data;
    id = (await createUser({ name, email, role, password })).id;
  } catch (error) {
    return { ...errorState(error), values };
  }
  redirect(`/admin/users/${id}?created=1`);
}

const changeRoleSchema = z.object({ userId: userIdSchema, role: roleSchema });

export async function changeRoleAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const actor = await requireAdmin();
  const parsed = changeRoleSchema.safeParse({ userId: formData.get("userId"), role: formData.get("role") });
  if (!parsed.success) return { fieldErrors: fieldErrorsFrom(parsed.error) };

  try {
    await changeUserRole(parsed.data.userId, parsed.data.role);
  } catch (error) {
    return errorState(error);
  }
  // An administrator who demoted themselves can no longer see this page.
  if (parsed.data.userId === actor.id && parsed.data.role !== "ADMINISTRATOR") redirect("/dashboard");
  refresh();
  return { success: "Role updated." };
}

const setActiveSchema = z.object({ userId: userIdSchema, active: z.enum(["true", "false"]) });

export async function setActiveAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const actor = await requireAdmin();
  const parsed = setActiveSchema.safeParse({ userId: formData.get("userId"), active: formData.get("active") });
  if (!parsed.success) return { error: "Invalid request." };

  const active = parsed.data.active === "true";
  try {
    await setUserActive(parsed.data.userId, active, actor.id);
  } catch (error) {
    return errorState(error);
  }
  refresh();
  return { success: active ? "Account reactivated." : "Account deactivated and all sessions revoked." };
}

export async function revokeSessionsAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const actor = await requireAdmin();
  const parsed = userIdSchema.safeParse(formData.get("userId"));
  if (!parsed.success) return { error: "Invalid request." };
  if (parsed.data === actor.id) return { error: "To end your own session, use Sign out." };

  const count = await revokeAllSessions(parsed.data);
  refresh();
  return { success: `${count} session${count === 1 ? "" : "s"} revoked.` };
}
