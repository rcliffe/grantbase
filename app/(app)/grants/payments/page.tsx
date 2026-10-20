import type { Metadata } from "next";
import { Alert } from "@/components/ui/alert";
import { EmptyState, PageHeader } from "@/components/ui/misc";
import { todayInUk } from "@/lib/grant-process";
import { formatDate, formatMoney, GRANT_PERMISSIONS, purposeSummary } from "@/lib/grants";
import { hasRole } from "@/lib/roles";
import { userIdSchema } from "@/lib/validation";
import { requireRole } from "@/server/authz/guards";
import { listAwaitingPayment } from "@/server/grants/process";
import { getGrant } from "@/server/grants/service";
import { ProcessCard } from "../process-card";
import { PaymentForm } from "../process-forms";

export const metadata: Metadata = { title: "Payments" };

export default async function PaymentsPage({ searchParams }: PageProps<"/grants/payments">) {
  const user = await requireRole(GRANT_PERMISSIONS.view);
  const params = await searchParams;
  const canProcess = hasRole(user.role, GRANT_PERMISSIONS.process);
  const paidId = typeof params.paid === "string" ? params.paid : "";
  const [grants, paid] = await Promise.all([listAwaitingPayment(), userIdSchema.safeParse(paidId).success ? getGrant(paidId) : null]);
  const total = grants.reduce((sum, g) => sum + Math.round(Number(g.amountAgreed ?? 0) * 100), 0) / 100;
  const today = todayInUk();

  return (
    <>
      <PageHeader
        title="Payments"
        description={
          grants.length > 0
            ? `${grants.length} approved grant${grants.length === 1 ? "" : "s"} awaiting payment · ${formatMoney(total.toFixed(2))} to pay. Oldest decision first.`
            : "Approved grants awaiting payment."
        }
      />
      {paid && (
        <Alert tone="success" className="mb-4">
          Marked as paid: {paid.charity.name}
          {paid.purpose ? ` – ${purposeSummary(paid.purpose)}` : ""}
          {paid.amountAgreed ? `, ${formatMoney(paid.amountAgreed)}` : ""} on {paid.paymentDate ? formatDate(paid.paymentDate) : "—"}. Status is now “
          {paid.status.name}”.
        </Alert>
      )}

      {grants.length === 0 ? (
        <EmptyState title="Nothing awaiting payment" description="Approved grants without a payment date appear here." />
      ) : (
        <div className="space-y-4">
          {grants.map((g) => (
            <ProcessCard key={g.id} grant={g}>
              {canProcess && <PaymentForm id={g.id} today={today} />}
            </ProcessCard>
          ))}
        </div>
      )}
    </>
  );
}
