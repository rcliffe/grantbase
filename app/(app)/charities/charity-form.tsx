"use client";

import { useActionState } from "react";
import { Alert } from "@/components/ui/alert";
import { LinkButton } from "@/components/ui/button";
import { InputField, TextareaField } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/submit-button";
import type { CharityInput } from "@/lib/charities";
import { initialFormState, type FormState } from "@/lib/form-state";

type Action = (prev: FormState, formData: FormData) => Promise<FormState>;

/** Create/edit form. `charity` pre-fills the fields when editing. */
export function CharityForm({
  action,
  charity,
  submitLabel,
  cancelHref,
}: {
  action: Action;
  charity?: CharityInput & { id: string };
  submitLabel: string;
  cancelHref: string;
}) {
  const [state, formAction] = useActionState<FormState, FormData>(action, initialFormState);
  const errors = state.fieldErrors ?? {};
  const value = (field: keyof CharityInput) => state.values?.[field] ?? charity?.[field] ?? "";
  // Remount after a failed submission so the echoed values are applied.
  const formKey = JSON.stringify(state.values ?? {});

  return (
    <form action={formAction} className="space-y-8" noValidate key={formKey}>
      {charity && <input type="hidden" name="id" value={charity.id} />}
      {state.error && <Alert tone="error">{state.error}</Alert>}
      {Object.keys(errors).length > 0 && !state.error && (
        <Alert tone="error">Check the highlighted fields and try again.</Alert>
      )}

      <fieldset className="space-y-4">
        <legend className="mb-2 text-sm font-semibold">Organisation</legend>
        <InputField name="name" label="Name" required autoComplete="organization" defaultValue={value("name")} error={errors.name} />
        <InputField
          name="registrationNumber"
          label="Registration number"
          defaultValue={value("registrationNumber")}
          hint="Optional. For example 1234567 or SC012345. Spaces are removed."
          error={errors.registrationNumber}
          className="max-w-xs"
        />
        <InputField
          name="yearEstablished"
          label="Year established"
          inputMode="numeric"
          maxLength={4}
          placeholder="e.g. 1998"
          defaultValue={value("yearEstablished")}
          hint="Optional."
          error={errors.yearEstablished}
          className="max-w-32"
        />
        <TextareaField
          name="description"
          label="Description"
          maxLength={1000}
          defaultValue={value("description")}
          hint="Optional. A brief summary of what the organisation does, up to 1,000 characters."
          error={errors.description}
        />
      </fieldset>

      <fieldset className="space-y-4">
        <legend className="mb-2 text-sm font-semibold">Address</legend>
        <InputField name="addressLine1" label="Address line 1" autoComplete="address-line1" defaultValue={value("addressLine1")} error={errors.addressLine1} />
        <InputField name="addressLine2" label="Address line 2" autoComplete="address-line2" defaultValue={value("addressLine2")} error={errors.addressLine2} />
        <div className="grid gap-4 sm:grid-cols-2">
          <InputField name="town" label="Town or city" autoComplete="address-level2" defaultValue={value("town")} error={errors.town} />
          <InputField name="county" label="County" autoComplete="address-level1" defaultValue={value("county")} error={errors.county} />
          <InputField name="postcode" label="Postcode" autoComplete="postal-code" defaultValue={value("postcode")} error={errors.postcode} />
          <InputField
            name="country"
            label="Country"
            autoComplete="country-name"
            defaultValue={charity || state.values ? value("country") : "United Kingdom"}
            error={errors.country}
          />
        </div>
      </fieldset>

      <fieldset className="space-y-4">
        <legend className="mb-2 text-sm font-semibold">Contact</legend>
        <div className="grid gap-4 sm:grid-cols-2">
          <InputField name="contactName" label="Contact name" autoComplete="name" defaultValue={value("contactName")} error={errors.contactName} />
          <InputField
            name="contactPosition"
            label="Position"
            autoComplete="organization-title"
            defaultValue={value("contactPosition")}
            hint="Their role in the organisation."
            error={errors.contactPosition}
          />
        </div>
        <InputField name="contactEmail" label="Contact email" type="email" autoComplete="email" defaultValue={value("contactEmail")} error={errors.contactEmail} />
        <InputField
          name="website"
          label="Website"
          type="url"
          inputMode="url"
          autoComplete="url"
          placeholder="https://example.org"
          defaultValue={value("website")}
          hint="https:// is added if you leave it out."
          error={errors.website}
        />
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
