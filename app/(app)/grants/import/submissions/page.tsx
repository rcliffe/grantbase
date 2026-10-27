import type { Metadata } from "next";
import Link from "next/link";
import { CsvImportForm } from "@/components/import/csv-import-form";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/misc";
import { CHARITY_PERMISSIONS } from "@/lib/charities";
import { IMPORT_MAX_ROWS } from "@/lib/csv-import";
import { GRANT_STAGE_LABELS } from "@/lib/grant-process";
import { GRANT_PERMISSIONS } from "@/lib/grants";
import { SUBMISSION_CSV_COLUMNS } from "@/lib/submissions-csv";
import { requireRole } from "@/server/authz/guards";
import { importSubmissionsAction } from "../../actions";

export const metadata: Metadata = { title: "Import submissions" };

export default async function ImportSubmissionsPage() {
  await requireRole(GRANT_PERMISSIONS.import);
  await requireRole(CHARITY_PERMISSIONS.import);
  return (
    <>
      <p className="mb-2 text-sm">
        <Link href="/grants" className="text-muted hover:text-foreground">
          ← Grants
        </Link>
      </p>
      <PageHeader
        title="Import submissions"
        description={`Add up to ${IMPORT_MAX_ROWS.toLocaleString("en-GB")} grant applications, and their charities, from an online application form's submissions report.`}
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <Card>
          <CardBody className="py-6">
            <CsvImportForm action={importSubmissionsAction} noun={{ one: "grant", many: "grants" }} backHref="/grants" />
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="How it works" />
          <CardBody>
            <ul className="list-inside list-disc space-y-1.5 text-sm">
              <li>Each row is one application. It adds a grant, and the charity too when it isn&apos;t recorded yet.</li>
              <li>
                Charities are matched by registration number, or else by name. An existing charity keeps its details: only
                blank ones are filled in from the file.
              </li>
              <li>
                Submissions already imported (same Random ID) are skipped, so you can import the same report again as new
                applications arrive.
              </li>
              <li>
                Categories and statuses are matched by name, ignoring case. A blank status means the first active status at
                the “{GRANT_STAGE_LABELS.SUBMITTED}” stage.
              </li>
              <li>Answers such as “N/A” or “None” count as blank. Dates such as 27-Oct-2026 14:32:10 or 27/10/2026 are accepted.</li>
              <li>
                Other columns are listed when you check the file but not imported. Use <strong>Check file</strong> to see what
                would be added; the file is imported completely or not at all.
              </li>
              <li>
                To change grants after importing them, edit them or use{" "}
                <Link href="/grants/import" className="text-accent hover:underline">
                  Import CSV
                </Link>
                .
              </li>
            </ul>
            <table className="mt-5 w-full text-left text-sm">
              <caption className="mb-2 text-left font-medium">Columns</caption>
              <tbody className="divide-y divide-line">
                {SUBMISSION_CSV_COLUMNS.map((c) => (
                  <tr key={c.header}>
                    <th scope="row" className="py-1.5 pr-4 align-top font-medium">
                      {c.header}
                    </th>
                    <td className="py-1.5 text-muted">{c.column ? (c.help ?? "Optional.") : "Not imported."}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardBody>
        </Card>
      </div>
    </>
  );
}
