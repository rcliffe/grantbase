"use client";

import { useActionState } from "react";
import { Alert } from "@/components/ui/alert";
import { LinkButton } from "@/components/ui/button";
import { InputField, SelectField } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/submit-button";
import { initialFormState, type FormState } from "@/lib/form-state";
import { ROLE_DESCRIPTIONS, ROLE_LABELS, ROLES } from "@/lib/roles";
import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from "@/lib/validation";
import { createUserAction } from "../actions";

const roleOptions = ROLES.map((role) => ({ value: role, label: `${ROLE_LABELS[role]} — ${ROLE_DESCRIPTIONS[role]}` }));

export function CreateUserForm() {
  const [state, formAction] = useActionState<FormState, FormData>(createUserAction, initialFormState);
  const errors = state.fieldErrors ?? {};
  const values = state.values ?? {};
  // Remount fields with the echoed values after a failed submission.
  const formKey = JSON.stringify(values);

  return (
    <form action={formAction} className="max-w-lg space-y-4" noValidate key={formKey}>
      {state.error && <Alert tone="error">{state.error}</Alert>}
      {Object.keys(errors).length > 0 && !state.error && (
        <Alert tone="error">Check the highlighted fields and try again.</Alert>
      )}
      <InputField name="name" label="Full name" autoComplete="off" required defaultValue={values.name} error={errors.name} />
      <InputField
        name="email"
        label="Email address"
        type="email"
        autoComplete="off"
        required
        defaultValue={values.email}
        hint="Used to sign in. Stored in lower case."
        error={errors.email}
      />
      <SelectField
        name="role"
        label="Role"
        options={roleOptions}
        defaultValue={values.role ?? "VIEWER"}
        error={errors.role}
      />
      <InputField
        name="password"
        label="Initial password"
        type="password"
        autoComplete="new-password"
        required
        minLength={PASSWORD_MIN_LENGTH}
        maxLength={PASSWORD_MAX_LENGTH}
        hint={`At least ${PASSWORD_MIN_LENGTH} characters.`}
        error={errors.password}
      />
      <InputField
        name="confirmPassword"
        label="Confirm initial password"
        type="password"
        autoComplete="new-password"
        required
        error={errors.confirmPassword}
      />
      <div className="flex gap-2 pt-2">
        <SubmitButton pendingLabel="Creating…">Create user</SubmitButton>
        <LinkButton href="/admin/users" variant="secondary">
          Cancel
        </LinkButton>
      </div>
    </form>
  );
}
