import type { Metadata } from "next";
import { Alert } from "@/components/ui/alert";
import { EmptyState, PageHeader } from "@/components/ui/misc";
import { todayInUk } from "@/lib/grant-process";
import { formatDate, formatMoney, GRANT_PERMISSIONS, purposeSummary } from "@/lib/grants";
import { hasRole } from "@/lib/roles";
import { userIdSchema } from "@/lib/validation";
import { requireRole } from "@/server/authz/guards";
import { listAwaitingDecision } from "@/server/grants/process";
import { getGrant } from "@/server/grants/service";
import { ProcessCard } from "../process-card";
import { DecisionForm } from "../process-forms";

export const metadata: Metadata = { title: "Decisions" };

function first(value: string | string[] | undefined): string {
  return (Array.isArray(value) ? value[0] : value) ?? "";
}

export default async function DecisionsPage({ searchParams }: PageProps<"/grants/decisions">) {
  const user = await requireRole(GRANT_PERMISSIONS.view);
  const params = await searchParams;
  const canProcess = hasRole(user.role, GRANT_PERMISSIONS.process);
  const outcome = params.approved ? "approved" : params.rejected ? "rejected" : null;
  const decidedId = first(params.approved ?? params.rejected);
  const [grants, decided] = await Promise.all([
    listAwaitingDecision(),
    outcome && userIdSchema.safeParse(decidedId).success ? getGrant(decidedId) : null,
  ]);
  const total = grants.reduce((sum, g) => sum + Math.round(Number(g.amountRequested) * 100), 0) / 100;
  const today = todayInUk();

  return (
    <>
      <PageHeader
        title="Decisions"
        description={
          grants.length > 0
            ? `${grants.length} grant${grants.length === 1 ? "" : "s"} awaiting a decision · ${formatMoney(total.toFixed(2))} requested. Oldest first.`
            : "Grants awaiting a decision."
        }
      />
      {decided && (
        <Alert tone="success" className="mb-4">
          {outcome === "approved" ? "Approved" : "Rejected"}: {decided.charity.name}
          {decided.purpose ? ` – ${purposeSummary(decided.purpose)}` : ""}
          {outcome === "approved" && decided.amountAgreed ? `, ${formatMoney(decided.amountAgreed)}` : ""} on {decided.decisionDate ? formatDate(decided.decisionDate) : "—"}. Status is now “
          {decided.status.name}”.
        </Alert>
      )}

      {grants.length === 0 ? (
        <EmptyState title="Nothing awaiting a decision" description="Grants with a status at the “Awaiting decision” stage appear here." />
      ) : (
        <div className="space-y-4">
          {grants.map((g) => (
            <ProcessCard key={g.id} grant={g}>
              {canProcess && (
                <DecisionForm
                  id={g.id}
                  label={`from ${g.charity.name} submitted ${formatDate(g.dateSubmitted)}`}
                  amountRequested={g.amountRequested}
                  today={today}
                />
              )}
            </ProcessCard>
          ))}
        </div>
      )}
    </>
  );
}
