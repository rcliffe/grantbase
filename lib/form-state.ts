import type { FieldErrors } from "./validation";

/** Result shape returned by form Server Actions and consumed by useActionState. */
export type FormState = {
  /** Form-level error message. */
  error?: string;
  /** Per-field validation messages keyed by input name. */
  fieldErrors?: FieldErrors;
  success?: string;
  /** Non-secret values echoed back so inputs keep their contents after an error. */
  values?: Record<string, string>;
};

export const initialFormState: FormState = {};
