import type { Metadata } from "next";
import Link from "next/link";
import { Card, CardBody } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/misc";
import { requireAdmin } from "@/server/authz/guards";
import { CreateUserForm } from "./create-user-form";

export const metadata: Metadata = { title: "New user" };

export default async function NewUserPage() {
  await requireAdmin();
  return (
    <>
      <p className="mb-2 text-sm">
        <Link href="/admin/users" className="text-muted hover:text-foreground">
          ← Users
        </Link>
      </p>
      <PageHeader
        title="New user"
        description="Share the initial password with the person securely. They can change it from their Account page."
      />
      <Card>
        <CardBody className="py-6">
          <CreateUserForm />
        </CardBody>
      </Card>
    </>
  );
}
