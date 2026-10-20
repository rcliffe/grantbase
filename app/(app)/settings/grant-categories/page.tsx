import type { Metadata } from "next";
import { LookupListPage } from "../_grant-lookups/pages";

export const metadata: Metadata = { title: "Grant categories" };

export default function Page({ searchParams }: PageProps<"/settings/grant-categories">) {
  return <LookupListPage kind="category" searchParams={searchParams} />;
}
