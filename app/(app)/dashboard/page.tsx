import type { Metadata } from "next";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { LinkButton } from "@/components/ui/button";
import { EmptyState, PageHeader } from "@/components/ui/misc";
import { hasRole, ROLE_DESCRIPTIONS, ROLE_LABELS } from "@/lib/roles";
import { requireUser } from "@/server/authz/guards";

export const metadata: Metadata = { title: "Dashboard" };

export default async function DashboardPage() {
  const user = await requireUser();
  const firstName = user.name.split(/\s+/)[0];

  return (
    <>
      <PageHeader title={`Welcome, ${firstName}`} description="Your workspace overview." />
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader title="Your access" />
          <CardBody>
            <p className="text-sm">
              You are signed in as <span className="font-medium">{ROLE_LABELS[user.role]}</span>.
            </p>
            <p className="mt-1 text-sm text-muted">{ROLE_DESCRIPTIONS[user.role]}</p>
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Quick links" />
          <CardBody className="flex flex-wrap gap-2">
            <LinkButton href="/charities" variant="secondary" size="sm">
              Charities
            </LinkButton>
            <LinkButton href="/account" variant="secondary" size="sm">
              Account settings
            </LinkButton>
            {hasRole(user.role, "ADMINISTRATOR") && (
              <LinkButton href="/admin/users" variant="secondary" size="sm">
                Manage users
              </LinkButton>
            )}
          </CardBody>
        </Card>
      </div>
      <div className="mt-6">
        <EmptyState
          title="Nothing here yet"
          description="Application features will appear on this dashboard as they are added."
        />
      </div>
    </>
  );
}
