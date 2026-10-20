import type { Metadata } from "next";
import Link from "next/link";
import { Card, CardBody } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/misc";
import { todayInUk } from "@/lib/grant-process";
import { GRANT_PERMISSIONS } from "@/lib/grants";
import { requireRole } from "@/server/authz/guards";
import { getGrantFormOptions } from "@/server/grants/service";
import { createGrantAction } from "../actions";
import { GrantForm } from "../grant-form";
import { GrantSetupNotice } from "../setup-notice";

export const metadata: Metadata = { title: "Add grant" };

export default async function NewGrantPage({ searchParams }: PageProps<"/grants/new">) {
  const user = await requireRole(GRANT_PERMISSIONS.edit);
  const [options, params] = await Promise.all([getGrantFormOptions(), searchParams]);
  // Arriving from a charity's page pre-selects it and returns there on cancel.
  const requested = typeof params.charityId === "string" ? params.charityId : "";
  const charity = options.charities.find((c) => c.id === requested);
  const backHref = charity ? `/charities/${charity.id}` : "/grants";
  const missing = [...(options.categories.length ? [] : ["category" as const]), ...(options.statuses.length ? [] : ["status" as const])];

  return (
    <>
      <p className="mb-2 text-sm">
        <Link href={backHref} className="text-muted hover:text-foreground">
          ← {charity ? charity.name : "Grants"}
        </Link>
      </p>
      <PageHeader title="Add grant" />
      {missing.length > 0 ? (
        <GrantSetupNotice role={user.role} missing={missing} />
      ) : (
        <Card>
          <CardBody className="max-w-2xl py-6">
            <GrantForm
              action={createGrantAction}
              options={options}
              defaults={{ charityId: charity?.id ?? "", dateSubmitted: todayInUk() }}
              submitLabel="Add grant"
              cancelHref={backHref}
            />
          </CardBody>
        </Card>
      )}
    </>
  );
}
