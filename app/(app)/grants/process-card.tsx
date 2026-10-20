import Link from "next/link";
import type { ReactNode } from "react";
import { Card, CardBody } from "@/components/ui/card";
import { Badge } from "@/components/ui/misc";
import { formatDate, formatMoney, purposeSummary } from "@/lib/grants";
import type { GrantItem } from "@/server/grants/service";

/** One grant in a process queue, with the step's form (or nothing, for read-only users). */
export function ProcessCard({ grant, children }: { grant: GrantItem; children?: ReactNode }) {
  return (
    <Card>
      <CardBody className="grid gap-4 py-5 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="min-w-0 space-y-2 text-sm">
          <div>
            <Link href={`/grants/${grant.id}`} className="font-semibold text-accent hover:underline">
              {grant.charity.name}
            </Link>
            {grant.purpose && <p className="mt-0.5 text-muted">{purposeSummary(grant.purpose, 120)}</p>}
          </div>
          <div className="flex flex-wrap gap-1.5">
            <Badge tone={grant.category.tone}>{grant.category.name}</Badge>
            <Badge tone={grant.status.tone}>{grant.status.name}</Badge>
          </div>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-1">
            <dt className="text-muted">Submitted</dt>
            <dd>{formatDate(grant.dateSubmitted)}</dd>
            <dt className="text-muted">Requested</dt>
            <dd className="tabular-nums">{formatMoney(grant.amountRequested)}</dd>
            {grant.decisionDate && (
              <>
                <dt className="text-muted">Decided</dt>
                <dd>{formatDate(grant.decisionDate)}</dd>
              </>
            )}
            {grant.amountAgreed && (
              <>
                <dt className="text-muted">Agreed</dt>
                <dd className="font-semibold tabular-nums">{formatMoney(grant.amountAgreed)}</dd>
              </>
            )}
          </dl>
        </div>
        {children && <div className="md:border-l md:border-line md:pl-5">{children}</div>}
      </CardBody>
    </Card>
  );
}
