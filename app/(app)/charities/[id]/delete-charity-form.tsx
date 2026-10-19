"use client";

import { useActionState } from "react";
import { Alert } from "@/components/ui/alert";
import { SubmitButton } from "@/components/ui/submit-button";
import { initialFormState, type FormState } from "@/lib/form-state";
import { deleteCharityAction } from "../actions";

export function DeleteCharityForm({ id, name }: { id: string; name: string }) {
  const [state, formAction] = useActionState<FormState, FormData>(deleteCharityAction, initialFormState);
  return (
    <form
      action={formAction}
      className="space-y-4"
      onSubmit={(event) => {
        if (!window.confirm(`Delete “${name}”? This can't be undone.`)) event.preventDefault();
      }}
    >
      {state.error && <Alert tone="error">{state.error}</Alert>}
      <input type="hidden" name="id" value={id} />
      <SubmitButton variant="danger" pendingLabel="Deleting…">
        Delete charity
      </SubmitButton>
    </form>
  );
}
