import type { Metadata } from "next";
import Link from "next/link";
import { CsvImportForm } from "@/components/import/csv-import-form";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/misc";
import { IMPORT_MAX_ROWS } from "@/lib/csv-import";
import { GRANT_CSV_COLUMNS } from "@/lib/grant-csv";
import { GRANT_PERMISSIONS } from "@/lib/grants";
import { requireRole } from "@/server/authz/guards";
import { importGrantsAction } from "../actions";

export const metadata: Metadata = { title: "Import grants" };

export default async function ImportGrantsPage() {
  await requireRole(GRANT_PERMISSIONS.import);
  return (
    <>
      <p className="mb-2 text-sm">
        <Link href="/grants" className="text-muted hover:text-foreground">
          ← Grants
        </Link>
      </p>
      <PageHeader
        title="Import grants"
        description={`Add or update up to ${IMPORT_MAX_ROWS.toLocaleString("en-GB")} grants from a CSV file.`}
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <Card>
          <CardBody className="py-6">
            <CsvImportForm action={importGrantsAction} noun={{ one: "grant", many: "grants" }} backHref="/grants" />
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="How it works" />
          <CardBody>
            <ul className="list-inside list-disc space-y-1.5 text-sm">
              <li>
                The easiest starting point is an{" "}
                {/* A plain link: the route returns a file download, not a page. */}
                {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
                <a href="/grants/export" className="text-accent hover:underline">
                  export of the current grants
                </a>
                : edit it and import it again.
              </li>
              <li>The first row must hold column names. Columns you leave out keep their current values.</li>
              <li>Rows with an ID update that grant. Rows without one add a new grant, which needs a charity, category, status, date submitted and amount requested.</li>
              <li>The charity must already exist. Categories and statuses are matched by name, ignoring case.</li>
              <li>Dates can be written as 2026-03-12 or 12/03/2026.</li>
              <li>The same rules apply as on the grant form. Use <strong>Check file</strong> to see what would change; the file is imported completely or not at all.</li>
            </ul>
            <table className="mt-5 w-full text-left text-sm">
              <caption className="mb-2 text-left font-medium">Columns</caption>
              <tbody className="divide-y divide-line">
                {GRANT_CSV_COLUMNS.map((c) => (
                  <tr key={c.header}>
                    <th scope="row" className="py-1.5 pr-4 align-top font-medium whitespace-nowrap">
                      {c.header}
                    </th>
                    <td className="py-1.5 text-muted">{c.help ?? "Optional."}</td>
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
