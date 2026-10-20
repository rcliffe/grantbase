"use client";

import { useActionState } from "react";
import { Alert } from "@/components/ui/alert";
import { SubmitButton } from "@/components/ui/submit-button";
import { initialFormState, type FormState } from "@/lib/form-state";
import { deleteGrantAction } from "./actions";

export function DeleteGrantForm({ id, label }: { id: string; label: string }) {
  const [state, formAction] = useActionState<FormState, FormData>(deleteGrantAction, initialFormState);
  return (
    <form
      action={formAction}
      className="space-y-4"
      onSubmit={(event) => {
        if (!window.confirm(`Delete the grant ${label}? This can't be undone.`)) event.preventDefault();
      }}
    >
      {state.error && <Alert tone="error">{state.error}</Alert>}
      <input type="hidden" name="id" value={id} />
      <SubmitButton variant="danger" pendingLabel="Deleting…">
        Delete grant
      </SubmitButton>
    </form>
  );
}
