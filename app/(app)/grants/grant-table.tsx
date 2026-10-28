import Link from "next/link";
import { Badge } from "@/components/ui/misc";
import { formatDate, formatMoney, purposeSummary, type GrantOrder } from "@/lib/grants";
import type { GrantItem } from "@/server/grants/service";

/**
 * Grants as a table. `showCharity` is off on a charity's own page. With `sort`, the
 * Submitted heading switches between newest and oldest first.
 */
export function GrantTable({
  grants,
  caption,
  showCharity = true,
  sort,
}: {
  grants: GrantItem[];
  caption: string;
  showCharity?: boolean;
  sort?: { order: GrantOrder; href: (order: GrantOrder) => string };
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <caption className="sr-only">{caption}</caption>
        <thead className="border-b border-line bg-surface-muted text-xs text-muted uppercase">
          <tr>
            <th scope="col" className="px-5 py-3 font-semibold" aria-sort={sort ? (sort.order === "oldest" ? "ascending" : "descending") : undefined}>
              {sort ? (
                <Link
                  href={sort.href(sort.order === "oldest" ? "newest" : "oldest")}
                  className="inline-flex items-center gap-1 rounded uppercase hover:text-foreground"
                  title={sort.order === "oldest" ? "Oldest first: show newest first" : "Newest first: show oldest first"}
                >
                  Submitted
                  <span aria-hidden="true">{sort.order === "oldest" ? "↑" : "↓"}</span>
                  <span className="sr-only">, {sort.order} first. Show {sort.order === "oldest" ? "newest" : "oldest"} first</span>
                </Link>
              ) : (
                "Submitted"
              )}
            </th>
            {showCharity && <th scope="col" className="px-5 py-3 font-semibold">Charity</th>}
            <th scope="col" className="px-5 py-3 font-semibold">Category</th>
            <th scope="col" className="px-5 py-3 font-semibold">Status</th>
            <th scope="col" className="px-5 py-3 text-right font-semibold">Requested</th>
            <th scope="col" className="px-5 py-3 text-right font-semibold">Agreed</th>
            <th scope="col" className="px-5 py-3 font-semibold">Paid</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {grants.map((g) => (
            <tr key={g.id} className="hover:bg-surface-muted/60">
              <td className="px-5 py-3 whitespace-nowrap">
                <Link href={`/grants/${g.id}`} className="rounded font-medium text-accent hover:underline">
                  {formatDate(g.dateSubmitted)}
                  <span className="sr-only">
                    {" "}
                    – {g.charity.name}
                    {g.purpose ? `, ${purposeSummary(g.purpose)}` : ""}
                  </span>
                </Link>
                {g.purpose && <span className="block max-w-56 truncate text-xs text-muted">{purposeSummary(g.purpose)}</span>}
              </td>
              {showCharity && (
                <td className="px-5 py-3">
                  <Link href={`/charities/${g.charity.id}`} className="hover:underline">
                    {g.charity.name}
                  </Link>
                </td>
              )}
              <td className="px-5 py-3">
                <Badge tone={g.category.tone}>{g.category.name}</Badge>
              </td>
              <td className="px-5 py-3">
                <Badge tone={g.status.tone}>{g.status.name}</Badge>
              </td>
              <td className="px-5 py-3 text-right whitespace-nowrap tabular-nums">{formatMoney(g.amountRequested)}</td>
              <td className="px-5 py-3 text-right whitespace-nowrap tabular-nums">{g.amountAgreed ? formatMoney(g.amountAgreed) : <Dash />}</td>
              <td className="px-5 py-3 whitespace-nowrap text-muted">{g.paymentDate ? formatDate(g.paymentDate) : <Dash />}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function Dash() {
  return (
    <span aria-label="Not recorded" className="text-muted/60">
      —
    </span>
  );
}
