import Link from "next/link";
import { notFound } from "next/navigation";
import { Alert } from "@/components/ui/alert";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Badge, EmptyState, PageHeader } from "@/components/ui/misc";
import { LOOKUP_CONFIG, LOOKUP_PERMISSIONS, STANDARD_GRANT_STATUSES, type LookupKind } from "@/lib/grant-lookups";
import { GRANT_STAGE_LABELS, GRANT_STAGES } from "@/lib/grant-process";
import { userIdSchema } from "@/lib/validation";
import { requireRole } from "@/server/authz/guards";
import { getLookup, listLookups } from "@/server/grant-lookups/service";
import { AddLookupForm, AddStandardStatusesForm, DeleteLookupForm, EditLookupForm, MoveButtons } from "./forms";

/** List page shared by grant categories and statuses. */
export async function LookupListPage({ kind, searchParams }: { kind: LookupKind; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireRole(LOOKUP_PERMISSIONS.manage);
  const config = LOOKUP_CONFIG[kind];
  const [items, query] = await Promise.all([listLookups(kind), searchParams]);

  return (
    <>
      <PageHeader title={config.title} description={config.description} />
      {query.saved === "1" && (
        <Alert tone="success" className="mb-4">
          Changes saved.
        </Alert>
      )}
      {query.deleted === "1" && (
        <Alert tone="success" className="mb-4">
          {config.singular[0].toUpperCase() + config.singular.slice(1)} deleted.
        </Alert>
      )}

      {kind === "status" && items.length > 0 && <MissingStagesNotice stages={items.filter((i) => i.active).map((i) => i.stage)} />}

      {items.length === 0 ? (
        <EmptyState
          title={`No ${config.plural} yet`}
          description={
            kind === "status"
              ? `Add your own below, or start with the standard set: ${STANDARD_GRANT_STATUSES.map((s) => s.name).join(", ")}.`
              : "Add the first one below."
          }
          action={kind === "status" ? <AddStandardStatusesForm /> : undefined}
        />
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <caption className="sr-only">{config.title}, in display order</caption>
              <thead className="border-b border-line bg-surface-muted text-xs text-muted uppercase">
                <tr>
                  <th scope="col" className="w-24 px-3 py-3 font-semibold">
                    <span className="sr-only">Order</span>
                  </th>
                  <th scope="col" className="px-5 py-3 font-semibold">Name</th>
                  <th scope="col" className="px-5 py-3 font-semibold">Description</th>
                  {kind === "status" && <th scope="col" className="px-5 py-3 font-semibold">Stage</th>}
                  <th scope="col" className="px-5 py-3 font-semibold">Status</th>
                  <th scope="col" className="px-5 py-3 font-semibold">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {items.map((item, i) => (
                  <tr key={item.id} className={item.active ? "hover:bg-surface-muted/60" : "text-muted hover:bg-surface-muted/60"}>
                    <td className="px-3 py-2">
                      <MoveButtons kind={kind} id={item.id} name={item.name} isFirst={i === 0} isLast={i === items.length - 1} />
                    </td>
                    <td className="px-5 py-3 whitespace-nowrap">
                      <Badge tone={item.tone}>{item.name}</Badge>
                    </td>
                    <td className="px-5 py-3 text-muted">{item.description ?? <span className="text-muted/60">—</span>}</td>
                    {kind === "status" && (
                      <td className="px-5 py-3 whitespace-nowrap text-muted">
                        {item.stage ? GRANT_STAGE_LABELS[item.stage] : <span className="text-muted/60">—</span>}
                      </td>
                    )}
                    <td className="px-5 py-3">{item.active ? <Badge tone="success">Active</Badge> : <Badge>Inactive</Badge>}</td>
                    <td className="px-5 py-3 text-right">
                      <Link href={`${config.basePath}/${item.id}`} className="text-accent hover:underline">
                        Edit<span className="sr-only"> {item.name}</span>
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <Card className="mt-6">
        <CardHeader title={`Add a ${config.singular}`} description="New entries go to the end of the list; use the arrows to reorder." />
        <CardBody className="max-w-2xl py-6">
          <AddLookupForm kind={kind} />
        </CardBody>
      </Card>
    </>
  );
}

/** Edit page shared by grant categories and statuses. */
export async function LookupEditPage({ kind, params }: { kind: LookupKind; params: Promise<{ id: string }> }) {
  await requireRole(LOOKUP_PERMISSIONS.manage);
  const config = LOOKUP_CONFIG[kind];
  const { id } = await params;
  if (!userIdSchema.safeParse(id).success) notFound();
  const item = await getLookup(kind, id);
  if (!item) notFound();

  return (
    <>
      <p className="mb-2 text-sm">
        <Link href={config.basePath} className="text-muted hover:text-foreground">
          ← {config.title}
        </Link>
      </p>
      <PageHeader title={`Edit ${config.singular}`} description={<Badge tone={item.tone}>{item.name}</Badge>} />
      <Card>
        <CardBody className="max-w-2xl py-6">
          <EditLookupForm kind={kind} item={item} />
        </CardBody>
      </Card>
      <Card className="mt-6">
        <CardHeader
          title={`Delete ${config.singular}`}
          description={`Permanently removes this ${config.singular}. To keep it on existing grants, deactivate it instead.`}
        />
        <CardBody>
          <DeleteLookupForm kind={kind} item={item} />
        </CardBody>
      </Card>
    </>
  );
}

/** Lists process stages with no active status, which leaves part of the process unusable. */
function MissingStagesNotice({ stages }: { stages: (string | null)[] }) {
  const missing = GRANT_STAGES.filter((s) => !stages.includes(s));
  if (missing.length === 0) return null;
  return (
    <Alert tone="warning" className="mb-4" title="Part of the grant process isn't set up">
      No active status has the stage {missing.map((s) => `“${GRANT_STAGE_LABELS[s]}”`).join(", ")}. Edit a status and choose its process stage
      {missing.includes("PAID") && missing.length === 1 ? " (optional: without one, marking as paid records the date but keeps the status)" : ""}.
    </Alert>
  );
}
