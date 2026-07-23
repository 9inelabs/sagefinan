import Papa from "papaparse";
import { getCurrentProfile, requireRole } from "@/lib/auth/profile";
import { listCurrentOpeningBalances } from "@/lib/opening-balances/actions";

export async function GET() {
  const profile = await getCurrentProfile();
  requireRole(profile, ["ADMIN"]);

  const rows = await listCurrentOpeningBalances();

  const csvRows = rows.map((r) => ({
    department: r.departmentName,
    code: r.productCode,
    name: r.productName,
    opening_qty: r.quantity,
    as_at_date: r.businessDay,
  }));

  const csv = Papa.unparse(csvRows, { columns: ["department", "code", "name", "opening_qty", "as_at_date"] });

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="opening-balances-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
}
