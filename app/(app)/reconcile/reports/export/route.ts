import Papa from "papaparse";
import { getCurrentProfile, requireRole } from "@/lib/auth/profile";
import { getVarianceByReasonReport } from "@/lib/reconcile/actions";

export async function GET(request: Request) {
  const profile = await getCurrentProfile();
  requireRole(profile, ["ADMIN", "AUDITOR"]);

  const url = new URL(request.url);
  const filters = {
    departmentId: url.searchParams.get("department") || undefined,
    from: url.searchParams.get("from") || undefined,
    to: url.searchParams.get("to") || undefined,
  };

  const { varianceRows, bookDiffRows } = await getVarianceByReasonReport(filters);

  const csvRows = [
    ...varianceRows.map((r) => ({
      kind: "Physical variance",
      reason: r.label,
      line_count: r.lineCount,
      total_quantity: r.totalQuantity,
      total_value: r.totalValue ?? "",
    })),
    ...bookDiffRows.map((r) => ({
      kind: "Book difference",
      reason: r.label,
      line_count: r.lineCount,
      total_quantity: r.totalQuantity,
      total_value: "",
    })),
  ];

  const csv = Papa.unparse(csvRows, { columns: ["kind", "reason", "line_count", "total_quantity", "total_value"] });

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="variance-reasons-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
}
