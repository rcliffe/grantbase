import { CHARITY_PERMISSIONS } from "@/lib/charities";
import { CHARITY_CSV_COLUMNS } from "@/lib/charity-csv";
import { toCsv } from "@/lib/csv";
import { requireRole } from "@/server/authz/guards";
import { exportCharities } from "@/server/charities/service";

/** GET /charities/export?q=… downloads the charities matching the list search as CSV. */
export async function GET(request: Request): Promise<Response> {
  await requireRole(CHARITY_PERMISSIONS.export);
  const query = new URL(request.url).searchParams.get("q") ?? "";
  const charities = await exportCharities(query);

  const rows = charities.map((c) =>
    CHARITY_CSV_COLUMNS.map((column) => {
      if (column.header === "ID") return c.id;
      if (column.header === "Created at") return c.createdAt.toISOString();
      if (column.header === "Updated at") return c.updatedAt.toISOString();
      return column.field ? c[column.field] : "";
    }),
  );
  const csv = toCsv([CHARITY_CSV_COLUMNS.map((c) => c.header), ...rows]);
  const date = new Date().toISOString().slice(0, 10);

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="charities-${date}.csv"`,
      "Cache-Control": "private, no-store",
    },
  });
}
