import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Card, CardBody } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/misc";
import { GRANT_PERMISSIONS, toDateInput } from "@/lib/grants";
import { userIdSchema } from "@/lib/validation";
import { requireRole } from "@/server/authz/guards";
import { getGrant, getGrantFormOptions } from "@/server/grants/service";
import { updateGrantAction } from "../../actions";
import { GrantForm } from "../../grant-form";

export const metadata: Metadata = { title: "Edit grant" };

export default async function EditGrantPage({ params }: PageProps<"/grants/[id]/edit">) {
  await requireRole(GRANT_PERMISSIONS.edit);
  const { id } = await params;
  if (!userIdSchema.safeParse(id).success) notFound();
  const grant = await getGrant(id);
  if (!grant) notFound();
  const options = await getGrantFormOptions({ categoryId: grant.category.id, statusId: grant.status.id });

  return (
    <>
      <p className="mb-2 text-sm">
        <Link href={`/grants/${grant.id}`} className="text-muted hover:text-foreground">
          ← Grant
        </Link>
      </p>
      <PageHeader title="Edit grant" description={grant.charity.name} />
      <Card>
        <CardBody className="max-w-2xl py-6">
          <GrantForm
            action={updateGrantAction}
            options={options}
            grant={{
              id: grant.id,
              charityId: grant.charity.id,
              categoryId: grant.category.id,
              statusId: grant.status.id,
              purpose: grant.purpose ?? "",
              dateSubmitted: toDateInput(grant.dateSubmitted),
              amountRequested: grant.amountRequested,
              amountAgreed: grant.amountAgreed ?? "",
              decisionDate: toDateInput(grant.decisionDate),
              paymentDate: toDateInput(grant.paymentDate),
            }}
            submitLabel="Save changes"
            cancelHref={`/grants/${grant.id}`}
          />
        </CardBody>
      </Card>
    </>
  );
}
