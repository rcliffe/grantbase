import type { Metadata } from "next";
import { LookupEditPage } from "../../_grant-lookups/pages";

export const metadata: Metadata = { title: "Edit grant category" };

export default function Page({ params }: PageProps<"/settings/grant-categories/[id]">) {
  return <LookupEditPage kind="category" params={params} />;
}
