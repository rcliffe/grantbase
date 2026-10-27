"use client";

import { useActionState, type ReactNode } from "react";
import { Alert } from "@/components/ui/alert";
import { Button, LinkButton } from "@/components/ui/button";
import { InputField, SelectField, TextareaField } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/submit-button";
import { initialFormState, type FormState } from "@/lib/form-state";
import { LOOKUP_CONFIG, LOOKUP_NAME_MAX_LENGTH, LOOKUP_TONE_LABELS, LOOKUP_TONES, type LookupKind, type LookupTone } from "@/lib/grant-lookups";
import { GRANT_STAGE_HELP, GRANT_STAGE_LABELS, GRANT_STAGES, type GrantStage } from "@/lib/grant-process";
import { addStandardStatusesAction, createLookupAction, deleteLookupAction, moveLookupAction, updateLookupAction } from "./actions";

type Action = (prev: FormState, formData: FormData) => Promise<FormState>;
type Item = { id: string; name: string; description: string | null; tone: LookupTone; stage: GrantStage | null; active: boolean };

const toneOptions = LOOKUP_TONES.map((tone) => ({ value: tone, label: LOOKUP_TONE_LABELS[tone] }));
const stageOptions = [
  { value: "", label: "None — not part of the process" },
  ...GRANT_STAGES.map((stage) => ({ value: stage, label: GRANT_STAGE_LABELS[stage] })),
];

function Feedback({ state }: { state: FormState }) {
  if (state.error) return <Alert tone="error">{state.error}</Alert>;
  if (state.success) return <Alert tone="success">{state.success}</Alert>;
  return null;
}

function LookupFields({ state, item, kind }: { state: FormState; item?: Item; kind: LookupKind }) {
  const errors = state.fieldErrors ?? {};
  const v = state.values;
  const active = v ? v.active === "on" : (item?.active ?? true);
  return (
    <>
      <InputField
        name="name"
        label="Name"
        required
        maxLength={LOOKUP_NAME_MAX_LENGTH}
        defaultValue={v?.name ?? item?.name ?? ""}
        error={errors.name}
      />
      <SelectField
        name="tone"
        label="Badge colour"
        options={toneOptions}
        defaultValue={v?.tone || item?.tone || "neutral"}
        error={errors.tone}
        className="sm:max-w-xs"
      />
      <TextareaField
        name="description"
        label="Description"
        rows={2}
        maxLength={500}
        defaultValue={v?.description ?? item?.description ?? ""}
        hint="Optional. Explains when to use this entry."
        error={errors.description}
      />
      {kind === "status" && (
        <SelectField
          name="stage"
          label="Process stage"
          options={stageOptions}
          defaultValue={v ? v.stage : (item?.stage ?? "")}
          hint={
            <>
              Links this status to the Decisions and Payments pages.{" "}
              {GRANT_STAGES.map((s) => `${GRANT_STAGE_LABELS[s]}: ${GRANT_STAGE_HELP[s].toLowerCase()}`).join(" ")}
            </>
          }
          error={errors.stage}
          className="sm:max-w-xs"
        />
      )}
      <div className="flex items-start gap-2">
        <input
          id="field-active"
          name="active"
          type="checkbox"
          defaultChecked={active}
          aria-describedby="field-active-hint"
          className="mt-0.5 size-4 rounded border-line-strong accent-accent"
        />
        <div>
          <label htmlFor="field-active" className="text-sm font-medium">
            Active
          </label>
          <p id="field-active-hint" className="text-xs text-muted">
            Inactive {LOOKUP_CONFIG[kind].plural} stay on existing grants but can&apos;t be chosen for new ones.
          </p>
        </div>
      </div>
    </>
  );
}

/** Adds an entry. The form clears after each successful add. */
export function AddLookupForm({ kind }: { kind: LookupKind }) {
  const [state, formAction] = useActionState<FormState, FormData>(createLookupAction.bind(null, kind) as Action, initialFormState);
  // Remount after each submission: clears the fields on success, re-applies echoed values on error.
  const key = state.success ?? JSON.stringify(state.values ?? {});
  return (
    <form action={formAction} className="space-y-4" noValidate key={key}>
      <Feedback state={state} />
      <LookupFields state={state.success ? initialFormState : state} kind={kind} />
      <SubmitButton pendingLabel="Adding…">Add {LOOKUP_CONFIG[kind].singular}</SubmitButton>
    </form>
  );
}

export function EditLookupForm({ kind, item }: { kind: LookupKind; item: Item }) {
  const [state, formAction] = useActionState<FormState, FormData>(updateLookupAction.bind(null, kind) as Action, initialFormState);
  return (
    <form action={formAction} className="space-y-4" noValidate key={JSON.stringify(state.values ?? {})}>
      <Feedback state={state} />
      <input type="hidden" name="id" value={item.id} />
      <LookupFields state={state} item={item} kind={kind} />
      <div className="flex gap-2">
        <SubmitButton pendingLabel="Saving…">Save changes</SubmitButton>
        <LinkButton href={LOOKUP_CONFIG[kind].basePath} variant="secondary">
          Cancel
        </LinkButton>
      </div>
    </form>
  );
}

export function DeleteLookupForm({ kind, item }: { kind: LookupKind; item: Item }) {
  const [state, formAction] = useActionState<FormState, FormData>(deleteLookupAction.bind(null, kind) as Action, initialFormState);
  return (
    <form
      action={formAction}
      className="space-y-4"
      onSubmit={(event) => {
        if (!window.confirm(`Delete “${item.name}”? This can't be undone.`)) event.preventDefault();
      }}
    >
      <Feedback state={state} />
      <input type="hidden" name="id" value={item.id} />
      <SubmitButton variant="danger" pendingLabel="Deleting…">
        Delete {LOOKUP_CONFIG[kind].singular}
      </SubmitButton>
    </form>
  );
}

/** Up/down buttons for one row. */
export function MoveButtons({ kind, id, name, isFirst, isLast }: { kind: LookupKind; id: string; name: string; isFirst: boolean; isLast: boolean }) {
  const [state, formAction, pending] = useActionState<FormState, FormData>(moveLookupAction.bind(null, kind) as Action, initialFormState);
  const button = (direction: "up" | "down", disabled: boolean, label: ReactNode) => (
    <Button
      type="submit"
      name="direction"
      value={direction}
      variant="ghost"
      size="sm"
      className="px-2"
      disabled={disabled || pending}
      aria-label={`Move ${name} ${direction}`}
      title={`Move ${direction}`}
    >
      {label}
    </Button>
  );
  return (
    <form action={formAction} className="flex items-center gap-0.5">
      <input type="hidden" name="id" value={id} />
      {button("up", isFirst, "↑")}
      {button("down", isLast, "↓")}
      {state.error && (
        <span role="alert" className="ml-2 text-xs text-danger">
          {state.error}
        </span>
      )}
    </form>
  );
}

export function AddStandardStatusesForm() {
  const [state, formAction] = useActionState<FormState, FormData>(addStandardStatusesAction, initialFormState);
  return (
    <form action={formAction} className="space-y-3">
      {state.error && <Alert tone="error">{state.error}</Alert>}
      <SubmitButton variant="secondary" pendingLabel="Adding…">
        Add standard statuses
      </SubmitButton>
    </form>
  );
}
