"use client";

import { useActionState } from "react";
import { Alert } from "@/components/ui/alert";
import { LinkButton } from "@/components/ui/button";
import { InputField, SelectField, TextareaField } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/submit-button";
import { initialFormState, type FormState } from "@/lib/form-state";
import { GRANT_PURPOSE_MAX_LENGTH, type GRANT_FIELDS } from "@/lib/grants";

type Action = (prev: FormState, formData: FormData) => Promise<FormState>;
type Field = (typeof GRANT_FIELDS)[number];
type Option = { id: string; name: string; active: boolean };

export type GrantFormValues = Record<Field, string>;

/** Create/edit form. `grant` pre-fills the fields when editing. */
export function GrantForm({
  action,
  grant,
  defaults,
  options,
  submitLabel,
  cancelHref,
}: {
  action: Action;
  grant?: GrantFormValues & { id: string };
  /** Initial values for a new grant, e.g. the charity it's being added to. */
  defaults?: Partial<GrantFormValues>;
  options: { charities: { id: string; name: string; registrationNumber: string | null }[]; categories: Option[]; statuses: Option[] };
  submitLabel: string;
  cancelHref: string;
}) {
  const [state, formAction] = useActionState<FormState, FormData>(action, initialFormState);
  const errors = state.fieldErrors ?? {};
  const value = (field: Field) => state.values?.[field] ?? grant?.[field] ?? defaults?.[field] ?? "";
  // Remount after a failed submission so the echoed values are applied.
  const formKey = JSON.stringify(state.values ?? {});

  const lookupOptions = (items: Option[], placeholder: string) => [
    { value: "", label: placeholder },
    ...items.map((o) => ({ value: o.id, label: o.active ? o.name : `${o.name} (inactive)` })),
  ];

  return (
    <form action={formAction} className="space-y-8" noValidate key={formKey}>
      {grant && <input type="hidden" name="id" value={grant.id} />}
      {state.error && <Alert tone="error">{state.error}</Alert>}
      {Object.keys(errors).length > 0 && !state.error && <Alert tone="error">Check the highlighted fields and try again.</Alert>}

      <fieldset className="space-y-4">
        <legend className="mb-2 text-sm font-semibold">Application</legend>
        <SelectField
          name="charityId"
          label="Charity"
          required
          defaultValue={value("charityId")}
          options={[
            { value: "", label: "Choose a charity…" },
            ...options.charities.map((c) => ({ value: c.id, label: c.registrationNumber ? `${c.name} (${c.registrationNumber})` : c.name })),
          ]}
          error={errors.charityId}
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <SelectField
            name="categoryId"
            label="Category"
            required
            defaultValue={value("categoryId")}
            options={lookupOptions(options.categories, "Choose a category…")}
            error={errors.categoryId}
          />
          <SelectField
            name="statusId"
            label="Status"
            required
            defaultValue={value("statusId")}
            options={lookupOptions(options.statuses, "Choose a status…")}
            error={errors.statusId}
          />
        </div>
        <TextareaField
          name="purpose"
          label="Purpose"
          rows={5}
          maxLength={GRANT_PURPOSE_MAX_LENGTH}
          defaultValue={value("purpose")}
          hint={`Optional. What the grant is for, up to ${GRANT_PURPOSE_MAX_LENGTH.toLocaleString("en-GB")} characters. The first line is shown in lists.`}
          error={errors.purpose}
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <InputField name="dateSubmitted" label="Date submitted" type="date" required defaultValue={value("dateSubmitted")} error={errors.dateSubmitted} />
          <InputField
            name="amountRequested"
            label="Amount requested (£)"
            inputMode="decimal"
            required
            placeholder="e.g. 2500"
            defaultValue={value("amountRequested")}
            error={errors.amountRequested}
          />
        </div>
      </fieldset>

      <fieldset className="space-y-4">
        <legend className="mb-2 text-sm font-semibold">Organisation at the time of application</legend>
        <p className="-mt-2 text-xs text-muted">Optional. The charity&apos;s figures as stated in the application.</p>
        <div className="grid gap-4 sm:grid-cols-2">
          <InputField name="accountsDate" label="Date of latest audited accounts" type="date" defaultValue={value("accountsDate")} error={errors.accountsDate} />
          <InputField
            name="penceInPound"
            label="Pence in the pound"
            inputMode="numeric"
            maxLength={4}
            placeholder="e.g. 85"
            defaultValue={value("penceInPound")}
            hint="Pence of each pound spent on charitable activities, 0 to 100."
            error={errors.penceInPound}
          />
          <InputField name="income" label="Income (£)" inputMode="decimal" defaultValue={value("income")} error={errors.income} />
          <InputField name="expenditure" label="Expenditure (£)" inputMode="decimal" defaultValue={value("expenditure")} error={errors.expenditure} />
          <InputField
            name="governmentFunding"
            label="Government funding (£)"
            inputMode="decimal"
            defaultValue={value("governmentFunding")}
            hint="From government or local authorities."
            error={errors.governmentFunding}
          />
        </div>
        <TextareaField
          name="otherFunders"
          label="Other funders"
          rows={2}
          maxLength={1000}
          defaultValue={value("otherFunders")}
          error={errors.otherFunders}
        />
        <div className="grid gap-4 sm:grid-cols-3">
          <InputField name="employees" label="Employees" inputMode="numeric" defaultValue={value("employees")} error={errors.employees} />
          <InputField name="volunteers" label="Volunteers" inputMode="numeric" defaultValue={value("volunteers")} error={errors.volunteers} />
          <InputField name="trustees" label="Trustees" inputMode="numeric" defaultValue={value("trustees")} error={errors.trustees} />
        </div>
      </fieldset>

      <fieldset className="space-y-4">
        <legend className="mb-2 text-sm font-semibold">Decision and payment</legend>
        <p className="-mt-2 text-xs text-muted">Leave these blank until they are known.</p>
        <div className="grid gap-4 sm:grid-cols-2">
          <InputField name="decisionDate" label="Decision date" type="date" defaultValue={value("decisionDate")} error={errors.decisionDate} />
          <InputField
            name="amountAgreed"
            label="Amount agreed (£)"
            inputMode="decimal"
            placeholder="e.g. 2000"
            defaultValue={value("amountAgreed")}
            hint="Enter 0 if the application was declined."
            error={errors.amountAgreed}
          />
          <InputField name="paymentDate" label="Payment date" type="date" defaultValue={value("paymentDate")} error={errors.paymentDate} />
        </div>
      </fieldset>

      <div className="flex gap-2">
        <SubmitButton pendingLabel="Saving…">{submitLabel}</SubmitButton>
        <LinkButton href={cancelHref} variant="secondary">
          Cancel
        </LinkButton>
      </div>
    </form>
  );
}
