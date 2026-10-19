import type { Metadata } from "next";
import { LinkButton } from "@/components/ui/button";
import { requireUser } from "@/server/authz/guards";

export const metadata: Metadata = { title: "Access denied" };

/** Where requireRole() sends signed-in users who lack the required role. */
export default async function ForbiddenPage() {
  await requireUser();
  return (
    <div className="mx-auto max-w-lg rounded-lg border border-line bg-surface px-6 py-10 text-center">
      <h1 className="text-lg font-semibold">You don&apos;t have access to that page</h1>
      <p className="mt-2 text-sm text-muted">
        Your role doesn&apos;t include permission for it. If you think this is a mistake, contact an administrator.
      </p>
      <div className="mt-6">
        <LinkButton href="/dashboard">Back to dashboard</LinkButton>
      </div>
    </div>
  );
}
