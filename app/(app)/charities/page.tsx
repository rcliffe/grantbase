import type { Metadata } from "next";
import Link from "next/link";
import { Alert } from "@/components/ui/alert";
import { buttonClasses, LinkButton } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState, PageHeader } from "@/components/ui/misc";
import { CHARITY_PERMISSIONS } from "@/lib/charities";
import { hasRole } from "@/lib/roles";
import { requireRole } from "@/server/authz/guards";
import { listCharities } from "@/server/charities/service";

export const metadata: Metadata = { title: "Charities" };

function first(value: string | string[] | undefined): string {
  return (Array.isArray(value) ? value[0] : value) ?? "";
}

export default async function CharitiesPage({ searchParams }: PageProps<"/charities">) {
  const user = await requireRole(CHARITY_PERMISSIONS.view);
  const params = await searchParams;
  const query = first(params.q).trim();
  const requestedPage = Number.parseInt(first(params.page), 10);
  const { items, total, page, pageCount } = await listCharities({
    query,
    page: Number.isFinite(requestedPage) ? requestedPage : 1,
  });
  const canEdit = hasRole(user.role, CHARITY_PERMISSIONS.edit);
  const newButton = canEdit ? <LinkButton href="/charities/new">Add charity</LinkButton> : null;
  const exportHref = query ? `/charities/export?${new URLSearchParams({ q: query })}` : "/charities/export";
  const headerActions = (
    <>
      {total > 0 && hasRole(user.role, CHARITY_PERMISSIONS.export) && (
        // A plain link: the route returns a file download, not a page.
        <a href={exportHref} className={buttonClasses("secondary")}>
          {query ? "Export results" : "Export CSV"}
        </a>
      )}
      {hasRole(user.role, CHARITY_PERMISSIONS.import) && (
        <LinkButton href="/charities/import" variant="secondary">
          Import CSV
        </LinkButton>
      )}
      {newButton}
    </>
  );

  const pageHref = (p: number) => {
    const search = new URLSearchParams();
    if (query) search.set("q", query);
    if (p > 1) search.set("page", String(p));
    const qs = search.toString();
    return qs ? `/charities?${qs}` : "/charities";
  };

  return (
    <>
      <PageHeader title="Charities" description="Organisations and their contact details." actions={headerActions} />

      {first(params.deleted) === "1" && (
        <Alert tone="success" className="mb-4">
          Charity deleted.
        </Alert>
      )}

      <form role="search" method="get" action="/charities" className="mb-4 flex max-w-xl gap-2">
        <label htmlFor="charity-search" className="sr-only">
          Search charities
        </label>
        <input
          id="charity-search"
          name="q"
          type="search"
          defaultValue={query}
          maxLength={100}
          placeholder="Search by name, registration number, town or postcode"
          className="block h-10 w-full rounded-md border border-line-strong bg-surface px-3 text-sm placeholder:text-muted/70"
        />
        <button type="submit" className={buttonClasses("secondary")}>
          Search
        </button>
        {query && (
          <Link href="/charities" className={buttonClasses("ghost")}>
            Clear
          </Link>
        )}
      </form>

      {items.length === 0 ? (
        query ? (
          <EmptyState title="No matching charities" description={`Nothing matches “${query}”. Try a different search.`} />
        ) : (
          <EmptyState
            title="No charities yet"
            description={canEdit ? "Add the first organisation to get started." : "Charities added by editors will appear here."}
            action={newButton}
          />
        )
      ) : (
        <>
          <Card className="overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <caption className="sr-only">
                  Charities{query ? ` matching “${query}”` : ""}, page {page} of {pageCount}
                </caption>
                <thead className="border-b border-line bg-surface-muted text-xs text-muted uppercase">
                  <tr>
                    <th scope="col" className="px-5 py-3 font-semibold">Name</th>
                    <th scope="col" className="px-5 py-3 font-semibold">Registration no.</th>
                    <th scope="col" className="px-5 py-3 font-semibold">Location</th>
                    <th scope="col" className="px-5 py-3 font-semibold">Contact email</th>
                    <th scope="col" className="px-5 py-3 font-semibold">Website</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {items.map((c) => (
                    <tr key={c.id} className="hover:bg-surface-muted/60">
                      <td className="px-5 py-3 font-medium">
                        <Link href={`/charities/${c.id}`} className="rounded text-accent hover:underline">
                          {c.name}
                        </Link>
                      </td>
                      <td className="px-5 py-3 font-mono text-xs whitespace-nowrap">{c.registrationNumber ?? <Dash />}</td>
                      <td className="px-5 py-3 text-muted">{[c.town, c.postcode].filter(Boolean).join(", ") || <Dash />}</td>
                      <td className="px-5 py-3 break-all text-muted">{c.contactEmail ?? <Dash />}</td>
                      <td className="px-5 py-3 break-all text-muted">
                        {c.website ? new URL(c.website).hostname.replace(/^www\./, "") : <Dash />}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
          <nav aria-label="Pagination" className="mt-4 flex items-center justify-between text-sm text-muted">
            <p>
              {total} charit{total === 1 ? "y" : "ies"}
              {pageCount > 1 && ` · page ${page} of ${pageCount}`}
            </p>
            {pageCount > 1 && (
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
            )}
          </nav>
        </>
      )}
    </>
  );
}

function Dash() {
  return (
    <span aria-label="Not provided" className="text-muted/60">
      —
    </span>
  );
}
