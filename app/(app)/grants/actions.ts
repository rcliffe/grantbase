"use server";

import { redirect } from "next/navigation";
import type { FormState } from "@/lib/form-state";
import { GRANT_FIELDS, GRANT_PERMISSIONS, grantSchema } from "@/lib/grants";
import { fieldErrorsFrom, userIdSchema } from "@/lib/validation";
import { requireRole } from "@/server/authz/guards";
import { createGrant, deleteGrant, GrantError, updateGrant } from "@/server/grants/service";

/* Every action checks the caller's role first: actions are public endpoints. */

function readValues(formData: FormData): Record<string, string> {
  return Object.fromEntries(GRANT_FIELDS.map((f) => [f, String(formData.get(f) ?? "")]));
}

function errorState(error: unknown, values: Record<string, string>): FormState {
  if (error instanceof GrantError) {
    const field = { CHARITY_NOT_FOUND: "charityId", INVALID_CATEGORY: "categoryId", INVALID_STATUS: "statusId", NOT_FOUND: null }[error.code];
    return field ? { fieldErrors: { [field]: error.message }, values } : { error: error.message, values };
  }
  throw error;
}

export async function createGrantAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireRole(GRANT_PERMISSIONS.edit);
  const values = readValues(formData);
  const parsed = grantSchema.safeParse(values);
  if (!parsed.success) return { fieldErrors: fieldErrorsFrom(parsed.error), values };

  let id: string;
  try {
    id = (await createGrant(parsed.data, user.id)).id;
  } catch (error) {
    return errorState(error, values);
  }
  redirect(`/grants/${id}?saved=created`);
}

export async function updateGrantAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireRole(GRANT_PERMISSIONS.edit);
  const id = userIdSchema.safeParse(formData.get("id"));
  if (!id.success) return { error: "Invalid request." };

  const values = readValues(formData);
  const parsed = grantSchema.safeParse(values);
  if (!parsed.success) return { fieldErrors: fieldErrorsFrom(parsed.error), values };

  try {
    await updateGrant(id.data, parsed.data, user.id);
  } catch (error) {
    return errorState(error, values);
  }
  redirect(`/grants/${id.data}?saved=updated`);
}

export async function deleteGrantAction(_prev: FormState, formData: FormData): Promise<FormState> {
  await requireRole(GRANT_PERMISSIONS.delete);
  const id = userIdSchema.safeParse(formData.get("id"));
  if (!id.success) return { error: "Invalid request." };

  try {
    await deleteGrant(id.data);
  } catch (error) {
    return errorState(error, {});
  }
  redirect("/grants?deleted=1");
}
