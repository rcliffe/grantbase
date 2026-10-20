"use client";

import { useActionState, useState, type FormEvent } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { InputField } from "@/components/ui/field";
import { Spinner } from "@/components/ui/spinner";
import { initialFormState, type FormState } from "@/lib/form-state";
import { decideGrantAction, markGrantPaidAction } from "./actions";

/** Approve (with amount agreed and decision date) or reject a grant. */
export function DecisionForm({ id, label, amountRequested, today }: { id: string; label: string; amountRequested: string; today: string }) {
  const [state, formAction, pending] = useActionState<FormState, FormData>(decideGrantAction, initialFormState);
  const [decision, setDecision] = useState<string | null>(null);
  const errors = state.fieldErrors ?? {};

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    const submitter = (event.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
    if (submitter?.value === "reject" && !window.confirm(`Reject the grant ${label}? The amount agreed will be recorded as £0.`)) {
      event.preventDefault();
      return;
    }
    setDecision(submitter?.value ?? null);
  }

  return (
    <form action={formAction} onSubmit={onSubmit} className="space-y-3" noValidate key={JSON.stringify(state.values ?? {})}>
      {state.error && <Alert tone="error">{state.error}</Alert>}
      <input type="hidden" name="id" value={id} />
      <div className="grid gap-3 sm:grid-cols-2">
        <InputField
          name="amountAgreed"
          id={`amount-${id}`}
          label="Amount agreed (£)"
          inputMode="decimal"
          defaultValue={state.values?.amountAgreed ?? amountRequested}
          hint="Used when approving. Rejecting records £0."
          error={errors.amountAgreed}
        />
        <InputField name="decisionDate" id={`decision-date-${id}`} label="Decision date" type="date" defaultValue={state.values?.decisionDate ?? today} error={errors.decisionDate} />
      </div>
      <div className="flex flex-wrap gap-2">
        <Button type="submit" name="decision" value="approve" disabled={pending}>
          {pending && decision === "approve" && <Spinner />}
          Approve
        </Button>
        <Button type="submit" name="decision" value="reject" variant="danger" disabled={pending}>
          {pending && decision === "reject" && <Spinner />}
          Reject
        </Button>
      </div>
    </form>
  );
}

export function PaymentForm({ id, today }: { id: string; today: string }) {
  const [state, formAction, pending] = useActionState<FormState, FormData>(markGrantPaidAction, initialFormState);
  const errors = state.fieldErrors ?? {};
  return (
    <form action={formAction} className="space-y-3" noValidate key={JSON.stringify(state.values ?? {})}>
      {state.error && <Alert tone="error">{state.error}</Alert>}
      <input type="hidden" name="id" value={id} />
      <div className="flex flex-wrap items-end gap-3">
        <div className="w-full sm:w-48">
          <InputField name="paymentDate" id={`payment-date-${id}`} label="Payment date" type="date" defaultValue={state.values?.paymentDate ?? today} error={errors.paymentDate} />
        </div>
        <Button type="submit" disabled={pending} className={errors.paymentDate ? "sm:mb-6" : undefined}>
          {pending && <Spinner />}
          Mark as paid
        </Button>
      </div>
    </form>
  );
}
