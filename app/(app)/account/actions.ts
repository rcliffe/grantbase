"use server";

import { headers } from "next/headers";
import type { FormState } from "@/lib/form-state";
import { changePasswordSchema, fieldErrorsFrom } from "@/lib/validation";
import { changeOwnPassword } from "@/server/auth/service";
import { requireUser } from "@/server/authz/guards";

export async function changePasswordAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();

  const parsed = changePasswordSchema.safeParse({
    currentPassword: formData.get("currentPassword"),
    newPassword: formData.get("newPassword"),
    confirmPassword: formData.get("confirmPassword"),
  });
  if (!parsed.success) return { fieldErrors: fieldErrorsFrom(parsed.error) };

  const { currentPassword, newPassword } = parsed.data;
  const result = await changeOwnPassword(user.id, { currentPassword, newPassword }, await headers());
  if (!result.ok) {
    switch (result.reason) {
      case "rate_limited":
        return { error: "Too many attempts. Wait a few minutes and try again." };
      case "unauthenticated":
        return { error: "Your session has ended. Sign in again." };
      default:
        return { fieldErrors: { currentPassword: "Your current password is incorrect." } };
    }
  }
  return { success: "Password changed. You have been signed out of all other devices." };
}
