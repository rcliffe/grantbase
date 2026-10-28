import type { Metadata } from "next";
import Link from "next/link";
import { Alert } from "@/components/ui/alert";
import { buttonClasses, LinkButton } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState, PageHeader } from "@/components/ui/misc";
import { Pagination } from "@/components/ui/pagination";
import { formatMoney, GRANT_PERMISSIONS, grantOrder, isIsoDate, type GrantOrder } from "@/lib/grants";
import { DEFAULT_PAGE_SIZE, pageSize, type PageSize } from "@/lib/pagination";
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
const dateClasses = "block h-10 min-w-0 flex-1 rounded-md border border-line-strong bg-surface px-3 text-sm text-foreground sm:flex-none";

/** A YYYY-MM-DD date from the URL, or "" when it isn't one. */
const isoDate = (value: string) => (isIsoDate(value) ? value : "");

export default async function GrantsPage({ searchParams }: PageProps<"/grants">) {
  const user = await requireRole(GRANT_PERMISSIONS.view);
  const params = await searchParams;
  const filters = {
    query: first(params.q).trim(),
    statusId: first(params.status).slice(0, 36),
    categoryId: first(params.category).slice(0, 36),
    dateFrom: isoDate(first(params.from)),
    dateTo: isoDate(first(params.to)),
  };
  // A range entered backwards still means the days between the two dates.
  if (filters.dateFrom && filters.dateTo && filters.dateFrom > filters.dateTo) {
    [filters.dateFrom, filters.dateTo] = [filters.dateTo, filters.dateFrom];
  }
  const order = grantOrder(first(params.sort));
  const requestedPage = Number.parseInt(first(params.page), 10);
  const [{ items, totals, page, pageCount, pageSize: size }, statuses, categories] = await Promise.all([
    listGrants({ ...filters, order, page: Number.isFinite(requestedPage) ? requestedPage : 1, pageSize: pageSize(first(params.size)) }),
    listLookups("status"),
    listLookups("category"),
  ]);
  const filtered = Boolean(filters.query || filters.statusId || filters.categoryId || filters.dateFrom || filters.dateTo);
  const canEdit = hasRole(user.role, GRANT_PERMISSIONS.edit);
  const newButton = canEdit ? <LinkButton href="/grants/new">Add grant</LinkButton> : null;
  /** The filters and order as URL parameters, as the filter form submits them. */
  const filterParams = (o: GrantOrder = order) => {
    const search = new URLSearchParams();
    if (filters.query) search.set("q", filters.query);
    if (filters.statusId) search.set("status", filters.statusId);
    if (filters.categoryId) search.set("category", filters.categoryId);
    if (filters.dateFrom) search.set("from", filters.dateFrom);
    if (filters.dateTo) search.set("to", filters.dateTo);
    if (o !== "newest") search.set("sort", o);
    return search;
  };
  const sortHref = (o: GrantOrder) => {
    const search = filterParams(o);
    if (size !== DEFAULT_PAGE_SIZE) search.set("size", String(size));
    return `/grants?${search}`;
  };
  // Clearing the filters keeps the order and page size.
  const kept = new URLSearchParams();
  if (order !== "newest") kept.set("sort", order);
  if (size !== DEFAULT_PAGE_SIZE) kept.set("size", String(size));
  const clearHref = kept.size ? `/grants?${kept}` : "/grants";
  const exportParams = filterParams();
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
        <>
          <LinkButton href="/grants/import/submissions" variant="secondary">
            Import submissions
          </LinkButton>
          <LinkButton href="/grants/import" variant="secondary">
            Import CSV
          </LinkButton>
        </>
      )}
      {newButton}
    </>
  );

  const pageHref = (p: number, s: PageSize = size) => {
    const search = filterParams();
    if (s !== DEFAULT_PAGE_SIZE) search.set("size", String(s));
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
        {/* One group, so the two dates wrap together. */}
        <div role="group" aria-label="Received date" className="flex w-full items-center gap-2 text-sm text-muted sm:w-auto">
          <label htmlFor="grant-from" className="whitespace-nowrap">
            Received<span className="sr-only"> from</span>
          </label>
          <input id="grant-from" name="from" type="date" defaultValue={filters.dateFrom} className={dateClasses} />
          <label htmlFor="grant-to">
            <span className="sr-only">Received </span>to
          </label>
          <input id="grant-to" name="to" type="date" defaultValue={filters.dateTo} className={dateClasses} />
        </div>
        {order !== "newest" && <input type="hidden" name="sort" value={order} />}
        {size !== DEFAULT_PAGE_SIZE && <input type="hidden" name="size" value={size} />}
        <button type="submit" className={buttonClasses("secondary")}>
          Filter
        </button>
        {filtered && (
          <Link href={clearHref} className={buttonClasses("ghost")}>
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
            <GrantTable
              grants={items}
              caption={`Grants${filtered ? " matching the filters" : ""}, ${order} first, page ${page} of ${pageCount}`}
              sort={{ order, href: sortHref }}
            />
          </Card>
          <Pagination
            summary={pageCount > 1 ? `Page ${page} of ${pageCount}` : null}
            total={totals.count}
            page={page}
            pageCount={pageCount}
            pageSize={size}
            href={pageHref}
          />
        </>
      )}
    </>
  );
}
