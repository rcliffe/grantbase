import { toCsv } from "@/lib/csv";
import { GRANT_CSV_COLUMNS } from "@/lib/grant-csv";
import { GRANT_PERMISSIONS, toDateInput } from "@/lib/grants";
import { requireRole } from "@/server/authz/guards";
import { exportGrants, type GrantItem } from "@/server/grants/service";

function cell(g: GrantItem, header: (typeof GRANT_CSV_COLUMNS)[number]["header"]): string {
  switch (header) {
    case "ID":
      return g.id;
    case "Charity":
      return g.charity.name;
    case "Charity registration number":
      return g.charity.registrationNumber ?? "";
    case "Charity ID":
      return g.charity.id;
    case "Category":
      return g.category.name;
    case "Status":
      return g.status.name;
    case "Purpose":
      return g.purpose ?? "";
    case "Date submitted":
      return toDateInput(g.dateSubmitted);
    case "Amount requested":
      return g.amountRequested;
    case "Amount agreed":
      return g.amountAgreed ?? "";
    case "Decision date":
      return toDateInput(g.decisionDate);
    case "Payment date":
      return toDateInput(g.paymentDate);
    case "Created at":
      return g.createdAt.toISOString();
    case "Updated at":
      return g.updatedAt.toISOString();
  }
}

/** GET /grants/export?q=…&status=…&category=… downloads the grants matching the list filters as CSV. */
export async function GET(request: Request): Promise<Response> {
  await requireRole(GRANT_PERMISSIONS.export);
  const params = new URL(request.url).searchParams;
  const grants = await exportGrants({
    query: params.get("q") ?? "",
    statusId: params.get("status")?.slice(0, 36) ?? "",
    categoryId: params.get("category")?.slice(0, 36) ?? "",
  });

  const csv = toCsv([GRANT_CSV_COLUMNS.map((c) => c.header), ...grants.map((g) => GRANT_CSV_COLUMNS.map((c) => cell(g, c.header)))]);
  const date = new Date().toISOString().slice(0, 10);
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="grants-${date}.csv"`,
      "Cache-Control": "private, no-store",
    },
  });
}
