"use client";

import { useActionState, type FormEvent } from "react";
import { Alert } from "@/components/ui/alert";
import { SelectField } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/submit-button";
import { initialFormState, type FormState } from "@/lib/form-state";
import { ROLE_DESCRIPTIONS, ROLE_LABELS, ROLES, type Role } from "@/lib/roles";
import { changeRoleAction, revokeSessionsAction, setActiveAction } from "../actions";

const roleOptions = ROLES.map((role) => ({ value: role, label: `${ROLE_LABELS[role]} — ${ROLE_DESCRIPTIONS[role]}` }));

function Feedback({ state }: { state: FormState }) {
  if (state.error) return <Alert tone="error">{state.error}</Alert>;
  if (state.success) return <Alert tone="success">{state.success}</Alert>;
  return null;
}

function confirmSubmit(message: string) {
  return (event: FormEvent<HTMLFormElement>) => {
    if (!window.confirm(message)) event.preventDefault();
  };
}

export function RoleForm({ userId, role, isSelf }: { userId: string; role: Role; isSelf: boolean }) {
  const [state, formAction] = useActionState<FormState, FormData>(changeRoleAction, initialFormState);
  return (
    <form
      action={formAction}
      className="max-w-lg space-y-4"
      onSubmit={
        isSelf ? confirmSubmit("Change your own role? You may lose access to user management.") : undefined
      }
    >
      <Feedback state={state} />
      <input type="hidden" name="userId" value={userId} />
      <SelectField
        name="role"
        label="Role"
        options={roleOptions}
        defaultValue={role}
        key={role}
        error={state.fieldErrors?.role}
      />
      <SubmitButton variant="secondary" pendingLabel="Saving…">
        Save role
      </SubmitButton>
    </form>
  );
}

export function StatusForm({ userId, active, isSelf }: { userId: string; active: boolean; isSelf: boolean }) {
  const [state, formAction] = useActionState<FormState, FormData>(setActiveAction, initialFormState);
  return (
    <form
      action={formAction}
      className="space-y-4"
      onSubmit={active ? confirmSubmit("Deactivate this account? The user will be signed out immediately.") : undefined}
    >
      <Feedback state={state} />
      <input type="hidden" name="userId" value={userId} />
      <input type="hidden" name="active" value={active ? "false" : "true"} />
      {isSelf ? (
        <p className="text-sm text-muted">You can&apos;t deactivate your own account.</p>
      ) : active ? (
        <SubmitButton variant="danger" pendingLabel="Deactivating…">
          Deactivate account
        </SubmitButton>
      ) : (
        <SubmitButton pendingLabel="Reactivating…">Reactivate account</SubmitButton>
      )}
    </form>
  );
}

export function RevokeSessionsForm({ userId, disabled }: { userId: string; disabled: boolean }) {
  const [state, formAction] = useActionState<FormState, FormData>(revokeSessionsAction, initialFormState);
  return (
    <form action={formAction} className="space-y-4">
      <Feedback state={state} />
      <input type="hidden" name="userId" value={userId} />
      <SubmitButton variant="secondary" size="sm" disabled={disabled} pendingLabel="Revoking…">
        Sign out of all sessions
      </SubmitButton>
    </form>
  );
}
