"use server";

import { redirect } from "next/navigation";
import { CHARITY_FIELDS, CHARITY_PERMISSIONS, charitySchema } from "@/lib/charities";
import { CHARITY_IMPORT_MAX_BYTES } from "@/lib/charity-csv";
import type { FormState } from "@/lib/form-state";
import { fieldErrorsFrom, userIdSchema } from "@/lib/validation";
import { requireRole } from "@/server/authz/guards";
import { importCharitiesCsv, type ImportSummary } from "@/server/charities/csv-import";
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

export type ImportState = {
  error?: string;
  /** "check" validates without saving; "import" saves when the file has no errors. */
  mode?: "check" | "import";
  fileName?: string;
  summary?: ImportSummary;
};

export async function importCharitiesAction(_prev: ImportState, formData: FormData): Promise<ImportState> {
  const user = await requireRole(CHARITY_PERMISSIONS.import);
  const mode = formData.get("mode") === "import" ? "import" : "check";
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { error: "Choose a CSV file to import." };
  if (file.size > CHARITY_IMPORT_MAX_BYTES) {
    return { error: `The file is larger than ${CHARITY_IMPORT_MAX_BYTES / 1024 / 1024} MB. Split it into smaller files.` };
  }

  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(await file.arrayBuffer());
  } catch {
    return { error: "The file isn't UTF-8 text. In Excel, save it as “CSV UTF-8 (Comma delimited)”." };
  }

  const summary = await importCharitiesCsv(text, user.id, { commit: mode === "import" });
  return { mode, fileName: file.name.slice(0, 200), summary };
}
