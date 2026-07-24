import Papa from "papaparse";
import { getCurrentProfile, requireRole } from "@/lib/auth/profile";
import { getRepeatVarianceReport } from "@/lib/reconcile/actions";
import { thirtyDaysAgoIso, todayIso } from "@/lib/dates";

export async function GET(request: Request) {
  const profile = await getCurrentProfile();
  requireRole(profile, ["ADMIN", "AUDITOR"]);

  const url = new URL(request.url);
  const from = url.searchParams.get("from") || thirtyDaysAgoIso();
  const to = url.searchParams.get("to") || todayIso();
  const sort = url.searchParams.get("sort") === "value" ? "value" : "occurrences";

  const rows = await getRepeatVarianceReport({ departmentId: url.searchParams.get("department") || undefined, from, to, sort });

  const csvRows = rows.map((r) => ({
    product_code: r.productCode,
    product_name: r.productName,
    department: r.departmentName,
    occurrences: r.occurrences,
    total_variance: r.totalVariance,
    total_value: r.totalValue,
  }));

  const csv = Papa.unparse(csvRows, {
    columns: ["product_code", "product_name", "department", "occurrences", "total_variance", "total_value"],
  });

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="repeat-variances-${from}-to-${to}.csv"`,
    },
  });
}
