"use client";

import { useActionState } from "react";
import { Alert } from "@/components/ui/alert";
import { InputField } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/submit-button";
import { initialFormState, type FormState } from "@/lib/form-state";
import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from "@/lib/validation";
import { changePasswordAction } from "./actions";

export function ChangePasswordForm() {
  const [state, formAction] = useActionState<FormState, FormData>(changePasswordAction, initialFormState);
  const errors = state.fieldErrors ?? {};
  return (
    // React resets uncontrolled inputs after a successful action, so no passwords linger.
    <form action={formAction} className="max-w-md space-y-4" noValidate>
      {state.error && <Alert tone="error">{state.error}</Alert>}
      {state.success && <Alert tone="success">{state.success}</Alert>}
      <InputField
        name="currentPassword"
        label="Current password"
        type="password"
        autoComplete="current-password"
        required
        error={errors.currentPassword}
      />
      <InputField
        name="newPassword"
        label="New password"
        type="password"
        autoComplete="new-password"
        required
        minLength={PASSWORD_MIN_LENGTH}
        maxLength={PASSWORD_MAX_LENGTH}
        hint={`At least ${PASSWORD_MIN_LENGTH} characters. A long passphrase is best.`}
        error={errors.newPassword}
      />
      <InputField
        name="confirmPassword"
        label="Confirm new password"
        type="password"
        autoComplete="new-password"
        required
        error={errors.confirmPassword}
      />
      <SubmitButton pendingLabel="Changing password…">Change password</SubmitButton>
    </form>
  );
}
