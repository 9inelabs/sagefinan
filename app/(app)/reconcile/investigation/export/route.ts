import Papa from "papaparse";
import { getCurrentProfile, requireRole } from "@/lib/auth/profile";
import { getUnderInvestigationLines } from "@/lib/reconcile/actions";

export async function GET(request: Request) {
  const profile = await getCurrentProfile();
  requireRole(profile, ["ADMIN", "AUDITOR"]);

  const url = new URL(request.url);
  const departmentId = url.searchParams.get("department") || undefined;

  const lines = await getUnderInvestigationLines({ departmentId });

  const csvRows = lines.map((l) => ({
    as_at_date: l.asAtDate,
    department: l.departmentName,
    product_code: l.code,
    product_name: l.name,
    kind: l.kind === "variance" ? "Physical variance" : "Book difference",
    expected_qty: l.expectedQty,
    counted_qty: l.countedQty,
    ledger_qty: l.ledgerQty ?? "",
    variance: l.variance,
    note: l.note ?? "",
    session_status: l.sessionStatus,
  }));

  const csv = Papa.unparse(csvRows, {
    columns: ["as_at_date", "department", "product_code", "product_name", "kind", "expected_qty", "counted_qty", "ledger_qty", "variance", "note", "session_status"],
  });

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="under-investigation-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
}
