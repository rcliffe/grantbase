import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { Alert } from "@/components/ui/alert";
import { LinkButton } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Badge, PageHeader } from "@/components/ui/misc";
import { formatDate, formatMoney, GRANT_PERMISSIONS } from "@/lib/grants";
import { hasRole } from "@/lib/roles";
import { userIdSchema } from "@/lib/validation";
import { requireRole } from "@/server/authz/guards";
import { getGrant } from "@/server/grants/service";
import { DeleteGrantForm } from "../delete-grant-form";
import { Dash } from "../grant-table";

export const metadata: Metadata = { title: "Grant" };

const dateTime = new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short" });

function Item({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-muted">{label}</dt>
      <dd className="mt-0.5">{children}</dd>
    </div>
  );
}

export default async function GrantPage({ params, searchParams }: PageProps<"/grants/[id]">) {
  const user = await requireRole(GRANT_PERMISSIONS.view);
  const { id } = await params;
  if (!userIdSchema.safeParse(id).success) notFound();
  const [grant, query] = await Promise.all([getGrant(id), searchParams]);
  if (!grant) notFound();

  const canEdit = hasRole(user.role, GRANT_PERMISSIONS.edit);
  const canDelete = hasRole(user.role, GRANT_PERMISSIONS.delete);
  const money = (amount: string | null) => (amount ? <span className="tabular-nums">{formatMoney(amount)}</span> : <Dash />);
  const count = (n: number | null) => (n === null ? <Dash /> : <span className="tabular-nums">{n.toLocaleString("en-GB")}</span>);
  const label = `submitted ${formatDate(grant.dateSubmitted)} by ${grant.charity.name}`;

  return (
    <>
      <p className="mb-2 text-sm">
        <Link href="/grants" className="text-muted hover:text-foreground">
          ← Grants
        </Link>
      </p>
      <PageHeader
        title={`${grant.category.name} grant`}
        description={
          <>
            <Link href={`/charities/${grant.charity.id}`} className="text-accent hover:underline">
              {grant.charity.name}
            </Link>{" "}
            · submitted {formatDate(grant.dateSubmitted)}
          </>
        }
        actions={canEdit && <LinkButton href={`/grants/${grant.id}/edit`}>Edit</LinkButton>}
      />
      {query.saved === "created" && (
        <Alert tone="success" className="mb-6">
          Grant added.
        </Alert>
      )}
      {query.saved === "updated" && (
        <Alert tone="success" className="mb-6">
          Changes saved.
        </Alert>
      )}

      <Card className="mb-6">
        <CardHeader title="Purpose" />
        <CardBody>
          {grant.purpose ? (
            <p className="max-w-prose text-sm leading-6 break-words whitespace-pre-line">{grant.purpose}</p>
          ) : (
            <p className="text-sm text-muted">Not recorded.</p>
          )}
        </CardBody>
      </Card>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader title="Application" />
          <CardBody>
            <dl className="space-y-3 text-sm">
              <Item label="Category">
                <Badge tone={grant.category.tone}>{grant.category.name}</Badge>
              </Item>
              <Item label="Status">
                <Badge tone={grant.status.tone}>{grant.status.name}</Badge>
              </Item>
              <Item label="Date submitted">{formatDate(grant.dateSubmitted)}</Item>
              <Item label="Amount requested">
                <span className="tabular-nums">{formatMoney(grant.amountRequested)}</span>
              </Item>
            </dl>
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Decision and payment" />
          <CardBody>
            <dl className="space-y-3 text-sm">
              <Item label="Decision date">{grant.decisionDate ? formatDate(grant.decisionDate) : <Dash />}</Item>
              <Item label="Amount agreed">
                {grant.amountAgreed ? <span className="tabular-nums">{formatMoney(grant.amountAgreed)}</span> : <Dash />}
              </Item>
              <Item label="Payment date">{grant.paymentDate ? formatDate(grant.paymentDate) : <Dash />}</Item>
            </dl>
          </CardBody>
        </Card>
      </div>

      <Card className="mt-6">
        <CardHeader title="Organisation at the time of application" description="The charity's figures as stated in the application." />
        <CardBody>
          <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2 lg:grid-cols-3">
            <Item label="Date of latest audited accounts">{grant.accountsDate ? formatDate(grant.accountsDate) : <Dash />}</Item>
            <Item label="Income">{money(grant.income)}</Item>
            <Item label="Expenditure">{money(grant.expenditure)}</Item>
            <Item label="Government funding">{money(grant.governmentFunding)}</Item>
            <Item label="Pence in the pound">{grant.penceInPound === null ? <Dash /> : `${grant.penceInPound}p`}</Item>
            <Item label="Employees">{count(grant.employees)}</Item>
            <Item label="Volunteers">{count(grant.volunteers)}</Item>
            <Item label="Trustees">{count(grant.trustees)}</Item>
          </dl>
          <dl className="mt-3 text-sm">
            <Item label="Other funders">
              {grant.otherFunders ? <span className="break-words whitespace-pre-line">{grant.otherFunders}</span> : <Dash />}
            </Item>
          </dl>
        </CardBody>
      </Card>

      {canDelete && (
        <Card className="mt-6">
          <CardHeader title="Delete grant" description="Permanently removes this grant. This can't be undone." />
          <CardBody>
            <DeleteGrantForm id={grant.id} label={label} />
          </CardBody>
        </Card>
      )}

      <p className="mt-6 text-xs text-muted">
        Added {dateTime.format(grant.createdAt)}
        {grant.createdBy && ` by ${grant.createdBy.name}`} · Last updated {dateTime.format(grant.updatedAt)}
        {grant.updatedBy && ` by ${grant.updatedBy.name}`}
        {grant.submissionReference && ` · Imported from form submission ${grant.submissionReference}`}
      </p>
    </>
  );
}
