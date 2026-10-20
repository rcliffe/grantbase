import type { ComponentProps, ReactNode } from "react";
import { cn } from "./cn";

const controlClasses =
  "block w-full rounded-md border border-line-strong bg-surface px-3 text-sm text-foreground placeholder:text-muted/70 aria-[invalid=true]:border-danger disabled:opacity-60";

/**
 * Labelled form control with hint and error text wired up through aria-describedby,
 * so screen readers announce errors alongside the field.
 */
export function Field({
  id,
  label,
  hint,
  error,
  children,
}: {
  id: string;
  label: string;
  hint?: ReactNode;
  error?: string;
  children: (describedBy: string | undefined, invalid: boolean) => ReactNode;
}) {
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(" ") || undefined;
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-sm font-medium">
        {label}
      </label>
      {children(describedBy, Boolean(error))}
      {hint && (
        <p id={hintId} className="text-xs text-muted">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} className="text-sm text-danger">
          {error}
        </p>
      )}
    </div>
  );
}

type InputFieldProps = Omit<ComponentProps<"input">, "id" | "name"> & {
  name: string;
  /** Defaults to `field-<name>`. Set it when a page repeats the same form. */
  id?: string;
  label: string;
  hint?: ReactNode;
  error?: string;
};

export function InputField({ name, id = `field-${name}`, label, hint, error, className, ...props }: InputFieldProps) {
  return (
    <Field id={id} label={label} hint={hint} error={error}>
      {(describedBy, invalid) => (
        <input
          id={id}
          name={name}
          aria-describedby={describedBy}
          aria-invalid={invalid}
          className={cn(controlClasses, "h-10", className)}
          {...props}
        />
      )}
    </Field>
  );
}

type TextareaFieldProps = Omit<ComponentProps<"textarea">, "id" | "name"> & {
  name: string;
  label: string;
  hint?: ReactNode;
  error?: string;
};

export function TextareaField({ name, label, hint, error, className, rows = 4, ...props }: TextareaFieldProps) {
  const id = `field-${name}`;
  return (
    <Field id={id} label={label} hint={hint} error={error}>
      {(describedBy, invalid) => (
        <textarea
          id={id}
          name={name}
          rows={rows}
          aria-describedby={describedBy}
          aria-invalid={invalid}
          className={cn(controlClasses, "py-2 leading-6", className)}
          {...props}
        />
      )}
    </Field>
  );
}

type SelectFieldProps = Omit<ComponentProps<"select">, "id" | "name"> & {
  name: string;
  label: string;
  hint?: ReactNode;
  error?: string;
  options: { value: string; label: string }[];
};

export function SelectField({ name, label, hint, error, options, className, ...props }: SelectFieldProps) {
  const id = `field-${name}`;
  return (
    <Field id={id} label={label} hint={hint} error={error}>
      {(describedBy, invalid) => (
        <select
          id={id}
          name={name}
          aria-describedby={describedBy}
          aria-invalid={invalid}
          className={cn(controlClasses, "h-10", className)}
          {...props}
        >
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      )}
    </Field>
  );
}
