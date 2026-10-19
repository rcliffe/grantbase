import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Alert } from "@/components/ui/alert";
import { LinkButton } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/misc";
import { addressLines, CHARITY_PERMISSIONS } from "@/lib/charities";
import { hasRole } from "@/lib/roles";
import { userIdSchema } from "@/lib/validation";
import { requireRole } from "@/server/authz/guards";
import { getCharity } from "@/server/charities/service";
import { DeleteCharityForm } from "./delete-charity-form";

export const metadata: Metadata = { title: "Charity" };

const dateTime = new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short" });

export default async function CharityPage({ params, searchParams }: PageProps<"/charities/[id]">) {
  const user = await requireRole(CHARITY_PERMISSIONS.view);
  const { id } = await params;
  if (!userIdSchema.safeParse(id).success) notFound();
  const [charity, query] = await Promise.all([getCharity(id), searchParams]);
  if (!charity) notFound();

  const canEdit = hasRole(user.role, CHARITY_PERMISSIONS.edit);
  const canDelete = hasRole(user.role, CHARITY_PERMISSIONS.delete);
  const address = addressLines(charity);

  return (
    <>
      <p className="mb-2 text-sm">
        <Link href="/charities" className="text-muted hover:text-foreground">
          ← Charities
        </Link>
      </p>
      <PageHeader
        title={charity.name}
        description={charity.registrationNumber ? `Registration number ${charity.registrationNumber}` : "No registration number recorded"}
        actions={canEdit && <LinkButton href={`/charities/${charity.id}/edit`}>Edit</LinkButton>}
      />
      {query.saved === "created" && (
        <Alert tone="success" className="mb-6">
          Charity added.
        </Alert>
      )}
      {query.saved === "updated" && (
        <Alert tone="success" className="mb-6">
          Changes saved.
        </Alert>
      )}

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader title="Address" />
          <CardBody>
            {address.length > 0 ? (
              <address className="text-sm leading-6 not-italic">
                {address.map((line, i) => (
                  <span key={i} className="block">
                    {line}
                  </span>
                ))}
              </address>
            ) : (
              <p className="text-sm text-muted">No address recorded.</p>
            )}
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Contact" />
          <CardBody>
            <dl className="space-y-3 text-sm">
              <div>
                <dt className="text-muted">Email</dt>
                <dd className="mt-0.5 break-all">
                  {charity.contactEmail ? (
                    <a href={`mailto:${charity.contactEmail}`} className="text-accent hover:underline">
                      {charity.contactEmail}
                    </a>
                  ) : (
                    <span className="text-muted">Not recorded</span>
                  )}
                </dd>
              </div>
              <div>
                <dt className="text-muted">Website</dt>
                <dd className="mt-0.5 break-all">
                  {charity.website ? (
                    // Only http(s) URLs are ever stored, so this href is safe.
                    <a href={charity.website} target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">
                      {charity.website}
                      <span className="sr-only"> (opens in a new tab)</span>
                    </a>
                  ) : (
                    <span className="text-muted">Not recorded</span>
                  )}
                </dd>
              </div>
            </dl>
          </CardBody>
        </Card>
      </div>

      {canDelete && (
        <Card className="mt-6">
          <CardHeader title="Delete charity" description="Permanently removes this charity. This can't be undone." />
          <CardBody>
            <DeleteCharityForm id={charity.id} name={charity.name} />
          </CardBody>
        </Card>
      )}

      <p className="mt-6 text-xs text-muted">
        Added {dateTime.format(charity.createdAt)}
        {charity.createdBy && ` by ${charity.createdBy.name}`} · Last updated {dateTime.format(charity.updatedAt)}
        {charity.updatedBy && ` by ${charity.updatedBy.name}`}
      </p>
    </>
  );
}
