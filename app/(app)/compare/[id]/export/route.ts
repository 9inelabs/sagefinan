import Papa from "papaparse";
import { getCurrentProfile, requireRole } from "@/lib/auth/profile";
import { listCompareRowsForExport } from "@/lib/counts/actions";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const profile = await getCurrentProfile();
  requireRole(profile, ["ADMIN", "AUDITOR"]);

  const { id } = await params;
  const url = new URL(request.url);
  const includeAll = url.searchParams.get("all") === "1";

  const rows = await listCompareRowsForExport(id, includeAll);

  const csvRows = rows.map((l) => ({
    product_code: l.code,
    product_name: l.name,
    expected_qty: l.expectedQty,
    counted_qty: l.countedQty,
    ledger_qty: l.ledgerQty ?? "",
    variance: l.variance,
    value: l.value,
    flag:
      [l.flag === "short" ? "Short" : l.flag === "excess" ? "Excess" : null, l.bookDiffers ? "Book differs" : null]
        .filter(Boolean)
        .join(" + ") || "Tally",
  }));

  const csv = Papa.unparse(csvRows, {
    columns: ["product_code", "product_name", "expected_qty", "counted_qty", "ledger_qty", "variance", "value", "flag"],
  });

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="compare-${id}-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
}
