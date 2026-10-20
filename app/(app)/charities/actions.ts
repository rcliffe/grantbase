"use server";

import { redirect } from "next/navigation";
import { CHARITY_FIELDS, CHARITY_PERMISSIONS, charitySchema } from "@/lib/charities";
import { readCsvUpload, type ImportState } from "@/lib/csv-import";
import type { FormState } from "@/lib/form-state";
import { fieldErrorsFrom, userIdSchema } from "@/lib/validation";
import { requireRole } from "@/server/authz/guards";
import { importCharitiesCsv } from "@/server/charities/csv-import";
import { CharityError, createCharity, deleteCharity, updateCharity } from "@/server/charities/service";

/* Every action checks the caller's role first: actions are public endpoints. */

function readValues(formData: FormData): Record<string, string> {
  return Object.fromEntries(CHARITY_FIELDS.map((f) => [f, String(formData.get(f) ?? "")]));
}

function errorState(error: unknown, values: Record<string, string>): FormState {
  if (error instanceof CharityError) {
    return error.code === "REGISTRATION_NUMBER_TAKEN"
      ? { fieldErrors: { registrationNumber: error.message }, values }
      : { error: error.message, values };
  }
  throw error;
}

export async function createCharityAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireRole(CHARITY_PERMISSIONS.edit);
  const values = readValues(formData);
  const parsed = charitySchema.safeParse(values);
  if (!parsed.success) return { fieldErrors: fieldErrorsFrom(parsed.error), values };

  let id: string;
  try {
    id = (await createCharity(parsed.data, user.id)).id;
  } catch (error) {
    return errorState(error, values);
  }
  redirect(`/charities/${id}?saved=created`);
}

export async function updateCharityAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireRole(CHARITY_PERMISSIONS.edit);
  const id = userIdSchema.safeParse(formData.get("id"));
  if (!id.success) return { error: "Invalid request." };

  const values = readValues(formData);
  const parsed = charitySchema.safeParse(values);
  if (!parsed.success) return { fieldErrors: fieldErrorsFrom(parsed.error), values };

  try {
    await updateCharity(id.data, parsed.data, user.id);
  } catch (error) {
    return errorState(error, values);
  }
  redirect(`/charities/${id.data}?saved=updated`);
}

export async function deleteCharityAction(_prev: FormState, formData: FormData): Promise<FormState> {
  await requireRole(CHARITY_PERMISSIONS.delete);
  const id = userIdSchema.safeParse(formData.get("id"));
  if (!id.success) return { error: "Invalid request." };

  try {
    await deleteCharity(id.data);
  } catch (error) {
    return errorState(error, {});
  }
  redirect("/charities?deleted=1");
}

export async function importCharitiesAction(_prev: ImportState, formData: FormData): Promise<ImportState> {
  const user = await requireRole(CHARITY_PERMISSIONS.import);
  const upload = await readCsvUpload(formData);
  if (!upload.ok) return { error: upload.error };
  const summary = await importCharitiesCsv(upload.text, user.id, { commit: upload.mode === "import" });
  return { mode: upload.mode, fileName: upload.fileName, summary };
}
