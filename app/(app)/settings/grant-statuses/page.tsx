import type { Metadata } from "next";
import { LookupListPage } from "../_grant-lookups/pages";

export const metadata: Metadata = { title: "Grant statuses" };

export default function Page({ searchParams }: PageProps<"/settings/grant-statuses">) {
  return <LookupListPage kind="status" searchParams={searchParams} />;
}
