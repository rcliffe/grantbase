import type { Metadata } from "next";
import Link from "next/link";
import { Alert } from "@/components/ui/alert";
import { buttonClasses, LinkButton } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState, PageHeader } from "@/components/ui/misc";
import { formatMoney, GRANT_PERMISSIONS } from "@/lib/grants";
import { hasRole } from "@/lib/roles";
import { requireRole } from "@/server/authz/guards";
import { listLookups } from "@/server/grant-lookups/service";
import { listGrants } from "@/server/grants/service";
import { GrantTable } from "./grant-table";

export const metadata: Metadata = { title: "Grants" };

function first(value: string | string[] | undefined): string {
  return (Array.isArray(value) ? value[0] : value) ?? "";
}

const selectClasses = "block h-10 w-full rounded-md border border-line-strong bg-surface px-3 text-sm sm:w-auto";

export default async function GrantsPage({ searchParams }: PageProps<"/grants">) {
  const user = await requireRole(GRANT_PERMISSIONS.view);
  const params = await searchParams;
  const filters = {
    query: first(params.q).trim(),
    statusId: first(params.status).slice(0, 36),
    categoryId: first(params.category).slice(0, 36),
  };
  const requestedPage = Number.parseInt(first(params.page), 10);
  const [{ items, totals, page, pageCount }, statuses, categories] = await Promise.all([
    listGrants({ ...filters, page: Number.isFinite(requestedPage) ? requestedPage : 1 }),
    listLookups("status"),
    listLookups("category"),
  ]);
  const filtered = Boolean(filters.query || filters.statusId || filters.categoryId);
  const canEdit = hasRole(user.role, GRANT_PERMISSIONS.edit);
  const newButton = canEdit ? <LinkButton href="/grants/new">Add grant</LinkButton> : null;
  const exportParams = new URLSearchParams();
  if (filters.query) exportParams.set("q", filters.query);
  if (filters.statusId) exportParams.set("status", filters.statusId);
  if (filters.categoryId) exportParams.set("category", filters.categoryId);
  const exportHref = exportParams.size ? `/grants/export?${exportParams}` : "/grants/export";
  const headerActions = (
    <>
      {totals.count > 0 && hasRole(user.role, GRANT_PERMISSIONS.export) && (
        // A plain link: the route returns a file download, not a page.
        <a href={exportHref} className={buttonClasses("secondary")}>
          {filtered ? "Export results" : "Export CSV"}
        </a>
      )}
      {hasRole(user.role, GRANT_PERMISSIONS.import) && (
        <LinkButton href="/grants/import" variant="secondary">
          Import CSV
        </LinkButton>
      )}
      {newButton}
    </>
  );

  const pageHref = (p: number) => {
    const search = new URLSearchParams();
    if (filters.query) search.set("q", filters.query);
    if (filters.statusId) search.set("status", filters.statusId);
    if (filters.categoryId) search.set("category", filters.categoryId);
    if (p > 1) search.set("page", String(p));
    const qs = search.toString();
    return qs ? `/grants?${qs}` : "/grants";
  };

  return (
    <>
      <PageHeader title="Grants" description="Grant applications submitted by charities." actions={headerActions} />

      {first(params.deleted) === "1" && (
        <Alert tone="success" className="mb-4">
          Grant deleted.
        </Alert>
      )}

      <form role="search" method="get" action="/grants" className="mb-4 flex flex-wrap items-end gap-2">
        <div className="w-full sm:w-72">
          <label htmlFor="grant-search" className="sr-only">
            Search grants
          </label>
          <input
            id="grant-search"
            name="q"
            type="search"
            defaultValue={filters.query}
            maxLength={100}
            placeholder="Charity, registration number or purpose"
            className="block h-10 w-full rounded-md border border-line-strong bg-surface px-3 text-sm placeholder:text-muted/70"
          />
        </div>
        <label htmlFor="grant-status" className="sr-only">
          Status
        </label>
        <select id="grant-status" name="status" defaultValue={filters.statusId} className={selectClasses}>
          <option value="">All statuses</option>
          {statuses.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
        <label htmlFor="grant-category" className="sr-only">
          Category
        </label>
        <select id="grant-category" name="category" defaultValue={filters.categoryId} className={selectClasses}>
          <option value="">All categories</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <button type="submit" className={buttonClasses("secondary")}>
          Filter
        </button>
        {filtered && (
          <Link href="/grants" className={buttonClasses("ghost")}>
            Clear
          </Link>
        )}
      </form>

      {items.length === 0 ? (
        filtered ? (
          <EmptyState title="No matching grants" description="Nothing matches these filters. Try changing or clearing them." />
        ) : (
          <EmptyState
            title="No grants yet"
            description={canEdit ? "Record the first grant application to get started." : "Grants added by editors will appear here."}
            action={newButton}
          />
        )
      ) : (
        <>
          <dl className="mb-4 grid gap-3 sm:grid-cols-3">
            {[
              ["Grants", totals.count.toLocaleString("en-GB")],
              ["Total requested", formatMoney(totals.requested)],
              ["Total agreed", formatMoney(totals.agreed)],
            ].map(([label, value]) => (
              <div key={label} className="rounded-lg border border-line bg-surface px-4 py-3">
                <dt className="text-xs text-muted">
                  {label}
                  {filtered && " (filtered)"}
                </dt>
                <dd className="mt-0.5 text-lg font-semibold tabular-nums">{value}</dd>
              </div>
            ))}
          </dl>
          <Card className="overflow-hidden">
            <GrantTable grants={items} caption={`Grants${filtered ? " matching the filters" : ""}, page ${page} of ${pageCount}`} />
          </Card>
          {pageCount > 1 && (
            <nav aria-label="Pagination" className="mt-4 flex items-center justify-between text-sm text-muted">
              <p>
                Page {page} of {pageCount}
              </p>
              <div className="flex gap-2">
                {page > 1 && (
                  <LinkButton href={pageHref(page - 1)} variant="secondary" size="sm">
                    Previous
                  </LinkButton>
                )}
                {page < pageCount && (
                  <LinkButton href={pageHref(page + 1)} variant="secondary" size="sm">
                    Next
                  </LinkButton>
                )}
              </div>
            </nav>
          )}
        </>
      )}
    </>
  );
}
