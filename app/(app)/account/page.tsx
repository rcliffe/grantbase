import type { Metadata } from "next";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Badge, PageHeader } from "@/components/ui/misc";
import { ROLE_LABELS } from "@/lib/roles";
import { getCurrentSession } from "@/server/auth/session";
import { requireUser } from "@/server/authz/guards";
import { ChangePasswordForm } from "./change-password-form";

export const metadata: Metadata = { title: "Account" };

const dateTime = new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short" });

export default async function AccountPage() {
  const user = await requireUser();
  const session = await getCurrentSession();

  return (
    <>
      <PageHeader title="Account" description="Your profile and sign-in settings." />
      <div className="space-y-6">
        <Card>
          <CardHeader title="Profile" description="Contact an administrator to change your name, email or role." />
          <CardBody>
            <dl className="grid gap-4 text-sm sm:grid-cols-3">
              <div>
                <dt className="text-muted">Name</dt>
                <dd className="mt-0.5 font-medium">{user.name}</dd>
              </div>
              <div>
                <dt className="text-muted">Email</dt>
                <dd className="mt-0.5 font-medium break-all">{user.email}</dd>
              </div>
              <div>
                <dt className="text-muted">Role</dt>
                <dd className="mt-1">
                  <Badge tone={user.role === "ADMINISTRATOR" ? "accent" : "neutral"}>{ROLE_LABELS[user.role]}</Badge>
                </dd>
              </div>
            </dl>
            {session && (
              <p className="mt-4 text-xs text-muted">
                This session expires {dateTime.format(session.session.expiresAt)} unless renewed by activity.
              </p>
            )}
          </CardBody>
        </Card>
        <Card>
          <CardHeader
            title="Change password"
            description="Changing your password signs you out everywhere else."
          />
          <CardBody>
            <ChangePasswordForm />
          </CardBody>
        </Card>
      </div>
    </>
  );
}
