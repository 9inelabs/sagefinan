import Papa from "papaparse";
import { getCurrentProfile } from "@/lib/auth/profile";
import { listSalesHistoryForExport, type SalesHistoryFilters } from "@/lib/sales/actions";

export async function GET(request: Request) {
  await getCurrentProfile();

  const url = new URL(request.url);
  const filters: SalesHistoryFilters = {
    q: url.searchParams.get("q") ?? undefined,
    departmentId: url.searchParams.get("department") ?? undefined,
    businessDayFrom: url.searchParams.get("from") ?? undefined,
    businessDayTo: url.searchParams.get("to") ?? undefined,
  };

  const rows = await listSalesHistoryForExport(filters);

  const csvRows = rows.map((r) => ({
    business_day: r.businessDay,
    department: r.departmentName,
    product_code: r.productCode,
    product_name: r.productName,
    quantity: r.quantity,
    entered_by: r.createdByName,
    time_recorded: new Date(r.createdAt).toISOString(),
    override: r.isOverride ? "yes" : "",
    reversal: r.isReversal ? "yes" : "",
    reversed: r.isReversed ? "yes" : "",
  }));

  const csv = Papa.unparse(csvRows, {
    columns: [
      "business_day",
      "department",
      "product_code",
      "product_name",
      "quantity",
      "entered_by",
      "time_recorded",
      "override",
      "reversal",
      "reversed",
    ],
  });

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="sales-history-export-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
}
