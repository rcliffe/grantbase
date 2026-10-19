import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Card, CardBody } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/misc";
import { CHARITY_PERMISSIONS } from "@/lib/charities";
import { userIdSchema } from "@/lib/validation";
import { requireRole } from "@/server/authz/guards";
import { getCharity } from "@/server/charities/service";
import { updateCharityAction } from "../../actions";
import { CharityForm } from "../../charity-form";

export const metadata: Metadata = { title: "Edit charity" };

export default async function EditCharityPage({ params }: PageProps<"/charities/[id]/edit">) {
  await requireRole(CHARITY_PERMISSIONS.edit);
  const { id } = await params;
  if (!userIdSchema.safeParse(id).success) notFound();
  const charity = await getCharity(id);
  if (!charity) notFound();

  return (
    <>
      <p className="mb-2 text-sm">
        <Link href={`/charities/${charity.id}`} className="text-muted hover:text-foreground">
          ← {charity.name}
        </Link>
      </p>
      <PageHeader title="Edit charity" />
      <Card>
        <CardBody className="max-w-2xl py-6">
          <CharityForm
            action={updateCharityAction}
            charity={charity}
            submitLabel="Save changes"
            cancelHref={`/charities/${charity.id}`}
          />
        </CardBody>
      </Card>
    </>
  );
}
