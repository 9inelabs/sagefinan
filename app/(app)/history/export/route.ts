import Papa from "papaparse";
import { getCurrentProfile, requireRole } from "@/lib/auth/profile";
import { listCountSessionsForExport, type SessionStatus } from "@/lib/counts/actions";

export async function GET(request: Request) {
  const profile = await getCurrentProfile();
  requireRole(profile, ["ADMIN", "AUDITOR"]);

  const url = new URL(request.url);
  const status = url.searchParams.get("status");

  const rows = await listCountSessionsForExport({
    departmentId: url.searchParams.get("department") || undefined,
    asAtFrom: url.searchParams.get("from") || undefined,
    asAtTo: url.searchParams.get("to") || undefined,
    statuses: status ? ([status as SessionStatus]) : undefined,
    productSearch: url.searchParams.get("q") || undefined,
  });

  const csvRows = rows.map((r) => ({
    as_at_date: r.asAtDate,
    department: r.departmentName,
    counted_by: r.countedByName,
    products: r.productCount,
    counted: r.countedCount,
    variances: r.varianceCount ?? "",
    variance_value: r.varianceValue ?? "",
    status: r.status,
  }));

  const csv = Papa.unparse(csvRows, {
    columns: ["as_at_date", "department", "counted_by", "products", "counted", "variances", "variance_value", "status"],
  });

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="count-history-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
}
