"use client";

import { startTransition, useActionState, useState, type FormEvent } from "react";
import { Alert } from "@/components/ui/alert";
import { Button, LinkButton } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { IMPORT_MAX_BYTES, type ImportState } from "@/lib/csv-import";

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/**
 * Upload form shared by the CSV imports: "Check file" reports what would change,
 * "Import" saves. `noun` names the records, e.g. { one: "charity", many: "charities" }.
 */
export function CsvImportForm({
  action,
  noun,
  backHref,
}: {
  action: (prev: ImportState, formData: FormData) => Promise<ImportState>;
  noun: { one: string; many: string };
  backHref: string;
}) {
  const [state, formAction, pending] = useActionState<ImportState, FormData>(action, {});
  const [submittedMode, setSubmittedMode] = useState<string | null>(null);
  const summary = state.summary;
  const pendingMode = pending ? submittedMode : null;

  // Submit manually rather than through `action`, which resets the form and would
  // make the user choose the file again between "Check" and "Import".
  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const submitter = (event.nativeEvent as SubmitEvent).submitter;
    const data = new FormData(event.currentTarget, submitter);
    setSubmittedMode(String(data.get("mode")));
    startTransition(() => formAction(data));
  }

  const counts = summary && (
    <ul className="mt-1 list-inside list-disc">
      <li>{plural(summary.created, `new ${noun.one}`, `new ${noun.many}`)}</li>
      <li>{plural(summary.updated, `${noun.one} updated`, `${noun.many} updated`)}</li>
      {summary.unchanged > 0 && (
        <li>
          {plural(summary.unchanged, "row matches", "rows match")} an existing {noun.one} with no changes
        </li>
      )}
      {summary.notes?.map((note) => (
        <li key={note}>{note}</li>
      ))}
    </ul>
  );
  const hasErrors = summary && (summary.fileErrors.length > 0 || summary.rowErrorCount > 0);

  return (
    <form onSubmit={onSubmit} className="space-y-6" noValidate>
      <div className="space-y-1.5">
        <label htmlFor="field-file" className="block text-sm font-medium">
          CSV file
        </label>
        <input
          id="field-file"
          name="file"
          type="file"
          accept=".csv,text/csv"
          required
          aria-describedby="field-file-hint"
          className="block w-full text-sm file:mr-3 file:h-10 file:rounded-md file:border file:border-line-strong file:bg-surface file:px-4 file:text-sm file:font-medium hover:file:bg-surface-muted"
        />
        <p id="field-file-hint" className="text-xs text-muted">
          UTF-8 CSV, up to {IMPORT_MAX_BYTES / 1024 / 1024} MB.
        </p>
      </div>

      {state.error && <Alert tone="error">{state.error}</Alert>}

      {summary && !hasErrors && summary.saved && (
        <Alert tone="success" title={`Imported ${state.fileName}`}>
          {counts}
          <LinkButton href={backHref} variant="secondary" size="sm" className="mt-3">
            View {noun.many}
          </LinkButton>
        </Alert>
      )}
      {summary && !hasErrors && !summary.saved && (
        <Alert tone="info" title={`${state.fileName} is ready to import`}>
          Importing it will save:
          {counts}
        </Alert>
      )}
      {summary && hasErrors && (
        <Alert tone="error" title="Nothing was imported. Fix these problems and try again.">
          <ul className="mt-1 list-inside list-disc space-y-0.5">
            {summary.fileErrors.map((message) => (
              <li key={message}>{message}</li>
            ))}
            {summary.rowErrors.map((e) => (
              <li key={e.row}>
                Row {e.row}: {e.message}
              </li>
            ))}
          </ul>
          {summary.rowErrorCount > summary.rowErrors.length && (
            <p className="mt-2">…and {summary.rowErrorCount - summary.rowErrors.length} more rows with problems.</p>
          )}
        </Alert>
      )}

      <div className="flex flex-wrap gap-2">
        <Button type="submit" name="mode" value="check" variant="secondary" disabled={pending}>
          {pendingMode === "check" && <Spinner />}
          Check file
        </Button>
        <Button type="submit" name="mode" value="import" disabled={pending}>
          {pendingMode === "import" && <Spinner />}
          Import
        </Button>
        <LinkButton href={backHref} variant="ghost">
          Cancel
        </LinkButton>
      </div>
    </form>
  );
}
