import type { Metadata } from "next";
import Link from "next/link";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/misc";
import { CHARITY_PERMISSIONS } from "@/lib/charities";
import { CsvImportForm } from "@/components/import/csv-import-form";
import { CHARITY_CSV_COLUMNS } from "@/lib/charity-csv";
import { IMPORT_MAX_ROWS } from "@/lib/csv-import";
import { requireRole } from "@/server/authz/guards";
import { importCharitiesAction } from "../actions";

export const metadata: Metadata = { title: "Import charities" };

export default async function ImportCharitiesPage() {
  await requireRole(CHARITY_PERMISSIONS.import);
  return (
    <>
      <p className="mb-2 text-sm">
        <Link href="/charities" className="text-muted hover:text-foreground">
          ← Charities
        </Link>
      </p>
      <PageHeader
        title="Import charities"
        description={`Add or update up to ${IMPORT_MAX_ROWS.toLocaleString("en-GB")} charities from a CSV file.`}
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <Card>
          <CardBody className="py-6">
            <CsvImportForm action={importCharitiesAction} noun={{ one: "charity", many: "charities" }} backHref="/charities" />
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
                <a href="/charities/export" className="text-accent hover:underline">
                  export of the current charities
                </a>
                : edit it and import it again.
              </li>
              <li>The first row must hold column names. Only “Name” is required; columns you leave out keep their current values.</li>
              <li>Rows with an ID update that charity. Rows without one update the charity with the same registration number, or else add a new charity.</li>
              <li>Use <strong>Check file</strong> to see what would change. The file is imported completely or not at all.</li>
            </ul>
            <table className="mt-5 w-full text-left text-sm">
              <caption className="mb-2 text-left font-medium">Columns</caption>
              <tbody className="divide-y divide-line">
                {CHARITY_CSV_COLUMNS.map((c) => (
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
