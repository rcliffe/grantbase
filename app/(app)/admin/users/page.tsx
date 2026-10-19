import type { Metadata } from "next";
import Link from "next/link";
import { LinkButton } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge, EmptyState, PageHeader } from "@/components/ui/misc";
import { ROLE_LABELS } from "@/lib/roles";
import { requireAdmin } from "@/server/authz/guards";
import { listUsers } from "@/server/users/service";

export const metadata: Metadata = { title: "Users" };

const dateFormat = new Intl.DateTimeFormat("en-GB", { dateStyle: "medium" });

export default async function UsersPage() {
  await requireAdmin();
  const users = await listUsers();

  return (
    <>
      <PageHeader
        title="Users"
        description="Create accounts, assign roles and control access."
        actions={<LinkButton href="/admin/users/new">New user</LinkButton>}
      />
      {users.length === 0 ? (
        <EmptyState
          title="No users yet"
          description="Create the first account to give someone access."
          action={<LinkButton href="/admin/users/new">New user</LinkButton>}
        />
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <caption className="sr-only">All user accounts</caption>
              <thead className="border-b border-line bg-surface-muted text-xs text-muted uppercase">
                <tr>
                  <th scope="col" className="px-5 py-3 font-semibold">Name</th>
                  <th scope="col" className="px-5 py-3 font-semibold">Email</th>
                  <th scope="col" className="px-5 py-3 font-semibold">Role</th>
                  <th scope="col" className="px-5 py-3 font-semibold">Status</th>
                  <th scope="col" className="px-5 py-3 font-semibold">Created</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {users.map((user) => (
                  <tr key={user.id} className="hover:bg-surface-muted/60">
                    <td className="px-5 py-3 font-medium">
                      <Link href={`/admin/users/${user.id}`} className="rounded text-accent hover:underline">
                        {user.name}
                      </Link>
                    </td>
                    <td className="px-5 py-3 break-all text-muted">{user.email}</td>
                    <td className="px-5 py-3">
                      <Badge tone={user.role === "ADMINISTRATOR" ? "accent" : "neutral"}>{ROLE_LABELS[user.role]}</Badge>
                    </td>
                    <td className="px-5 py-3">
                      {user.active ? <Badge tone="success">Active</Badge> : <Badge tone="danger">Deactivated</Badge>}
                    </td>
                    <td className="px-5 py-3 whitespace-nowrap text-muted">{dateFormat.format(user.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </>
  );
}
