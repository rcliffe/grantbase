import type { Metadata } from "next";
import { LookupEditPage } from "../../_grant-lookups/pages";

export const metadata: Metadata = { title: "Edit grant status" };

export default function Page({ params }: PageProps<"/settings/grant-statuses/[id]">) {
  return <LookupEditPage kind="status" params={params} />;
}
