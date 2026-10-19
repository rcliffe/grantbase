import type { Metadata } from "next";
import Link from "next/link";
import { Card, CardBody } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/misc";
import { CHARITY_PERMISSIONS } from "@/lib/charities";
import { requireRole } from "@/server/authz/guards";
import { createCharityAction } from "../actions";
import { CharityForm } from "../charity-form";

export const metadata: Metadata = { title: "Add charity" };

export default async function NewCharityPage() {
  await requireRole(CHARITY_PERMISSIONS.edit);
  return (
    <>
      <p className="mb-2 text-sm">
        <Link href="/charities" className="text-muted hover:text-foreground">
          ← Charities
        </Link>
      </p>
      <PageHeader title="Add charity" />
      <Card>
        <CardBody className="max-w-2xl py-6">
          <CharityForm action={createCharityAction} submitLabel="Add charity" cancelHref="/charities" />
        </CardBody>
      </Card>
    </>
  );
}
