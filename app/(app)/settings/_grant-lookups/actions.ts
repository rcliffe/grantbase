"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import type { FormState } from "@/lib/form-state";
import { LOOKUP_CONFIG, LOOKUP_FIELDS, LOOKUP_PERMISSIONS, lookupKindSchema, lookupSchema, type LookupKind } from "@/lib/grant-lookups";
import { fieldErrorsFrom, userIdSchema } from "@/lib/validation";
import { requireRole } from "@/server/authz/guards";
import {
  addStandardStatuses,
  createLookup,
  deleteLookup,
  LookupError,
  moveLookup,
  updateLookup,
} from "@/server/grant-lookups/service";

/*
 * Shared by grant categories and grant statuses. Pages bind the kind as the first
 * argument; it arrives from the client like any other input, so it is re-validated.
 * Every action checks the caller's role first: actions are public endpoints.
 */

function readValues(formData: FormData): Record<string, string> {
  return Object.fromEntries(LOOKUP_FIELDS.map((f) => [f, String(formData.get(f) ?? "")]));
}

function parseKind(kind: unknown): LookupKind {
  const parsed = lookupKindSchema.safeParse(kind);
  if (!parsed.success) throw new Error("Invalid list.");
  return parsed.data;
}

function errorState(error: unknown, values?: Record<string, string>): FormState {
  if (error instanceof LookupError) {
    return error.code === "NAME_TAKEN" ? { fieldErrors: { name: error.message }, values } : { error: error.message, values };
  }
  throw error;
}

function parseInput(formData: FormData) {
  const values = readValues(formData);
  // Unticked checkboxes aren't submitted at all.
  const parsed = lookupSchema.safeParse({ ...values, active: formData.get("active") ?? undefined });
  return { values, parsed };
}

export async function createLookupAction(kind: LookupKind, _prev: FormState, formData: FormData): Promise<FormState> {
  await requireRole(LOOKUP_PERMISSIONS.manage);
  const k = parseKind(kind);
  const { values, parsed } = parseInput(formData);
  if (!parsed.success) return { fieldErrors: fieldErrorsFrom(parsed.error), values };

  try {
    await createLookup(k, parsed.data);
  } catch (error) {
    return errorState(error, values);
  }
  refresh();
  return { success: `Added “${parsed.data.name}”.` };
}

export async function updateLookupAction(kind: LookupKind, _prev: FormState, formData: FormData): Promise<FormState> {
  await requireRole(LOOKUP_PERMISSIONS.manage);
  const k = parseKind(kind);
  const id = userIdSchema.safeParse(formData.get("id"));
  if (!id.success) return { error: "Invalid request." };
  const { values, parsed } = parseInput(formData);
  if (!parsed.success) return { fieldErrors: fieldErrorsFrom(parsed.error), values };

  try {
    await updateLookup(k, id.data, parsed.data);
  } catch (error) {
    return errorState(error, values);
  }
  redirect(`${LOOKUP_CONFIG[k].basePath}?saved=1`);
}

export async function deleteLookupAction(kind: LookupKind, _prev: FormState, formData: FormData): Promise<FormState> {
  await requireRole(LOOKUP_PERMISSIONS.manage);
  const k = parseKind(kind);
  const id = userIdSchema.safeParse(formData.get("id"));
  if (!id.success) return { error: "Invalid request." };

  try {
    await deleteLookup(k, id.data);
  } catch (error) {
    return errorState(error);
  }
  redirect(`${LOOKUP_CONFIG[k].basePath}?deleted=1`);
}

const moveSchema = z.object({ id: userIdSchema, direction: z.enum(["up", "down"]) });

export async function moveLookupAction(kind: LookupKind, _prev: FormState, formData: FormData): Promise<FormState> {
  await requireRole(LOOKUP_PERMISSIONS.manage);
  const k = parseKind(kind);
  const parsed = moveSchema.safeParse({ id: formData.get("id"), direction: formData.get("direction") });
  if (!parsed.success) return { error: "Invalid request." };

  try {
    await moveLookup(k, parsed.data.id, parsed.data.direction);
  } catch (error) {
    return errorState(error);
  }
  refresh();
  return {};
}

export async function addStandardStatusesAction(): Promise<FormState> {
  await requireRole(LOOKUP_PERMISSIONS.manage);
  try {
    const count = await addStandardStatuses();
    refresh();
    return { success: `Added ${count} standard statuses.` };
  } catch (error) {
    return errorState(error);
  }
}
