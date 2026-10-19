import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Alert } from "@/components/ui/alert";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Badge, PageHeader } from "@/components/ui/misc";
import { ROLE_LABELS } from "@/lib/roles";
import { userIdSchema } from "@/lib/validation";
import { requireAdmin } from "@/server/authz/guards";
import { countActiveSessions, getUserById } from "@/server/users/service";
import { RevokeSessionsForm, RoleForm, StatusForm } from "./user-forms";

export const metadata: Metadata = { title: "User" };

const dateTime = new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short" });

export default async function UserDetailPage({ params, searchParams }: PageProps<"/admin/users/[id]">) {
  const actor = await requireAdmin();
  const { id } = await params;
  if (!userIdSchema.safeParse(id).success) notFound();

  const user = await getUserById(id);
  if (!user) notFound();

  const [sessions, query] = await Promise.all([countActiveSessions(user.id), searchParams]);
  const isSelf = user.id === actor.id;

  return (
    <>
      <p className="mb-2 text-sm">
        <Link href="/admin/users" className="text-muted hover:text-foreground">
          ← Users
        </Link>
      </p>
      <PageHeader
        title={user.name}
        description={user.email}
        actions={
          <div className="flex items-center gap-2">
            <Badge tone={user.role === "ADMINISTRATOR" ? "accent" : "neutral"}>{ROLE_LABELS[user.role]}</Badge>
            {user.active ? <Badge tone="success">Active</Badge> : <Badge tone="danger">Deactivated</Badge>}
          </div>
        }
      />
      {query.created === "1" && (
        <Alert tone="success" className="mb-6">
          User created. Share the initial password with them securely.
        </Alert>
      )}
      <div className="space-y-6">
        <Card>
          <CardHeader title="Role" description="Controls what this user can see and do." />
          <CardBody>
            <RoleForm userId={user.id} role={user.role} isSelf={isSelf} />
          </CardBody>
        </Card>
        <Card>
          <CardHeader
            title="Access"
            description={
              user.active
                ? "Deactivating blocks sign-in and immediately ends every session."
                : "This account cannot sign in."
            }
          />
          <CardBody className="space-y-4">
            <StatusForm userId={user.id} active={user.active} isSelf={isSelf} />
            {!isSelf && user.active && (
              <div className="border-t border-line pt-4">
                <p className="mb-3 text-sm text-muted">
                  {sessions} active session{sessions === 1 ? "" : "s"}.
                </p>
                <RevokeSessionsForm userId={user.id} disabled={sessions === 0} />
              </div>
            )}
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Password" />
          <CardBody>
            <p className="text-sm text-muted">
              Passwords are reset from the command line (this also signs the user out everywhere):
            </p>
            <pre className="mt-2 overflow-x-auto rounded-md bg-surface-muted px-3 py-2 font-mono text-xs">
              npm run admin:reset-password -- {user.email}
            </pre>
          </CardBody>
        </Card>
        <p className="text-xs text-muted">
          Created {dateTime.format(user.createdAt)} · Last updated {dateTime.format(user.updatedAt)}
        </p>
      </div>
    </>
  );
}
