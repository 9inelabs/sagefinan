import Papa from "papaparse";
import { getCurrentProfile } from "@/lib/auth/profile";
import { getLedgerData } from "@/lib/ledger/actions";

export async function GET(request: Request) {
  await getCurrentProfile();

  const url = new URL(request.url);
  const departmentId = url.searchParams.get("department");
  const date = url.searchParams.get("date");
  if (!departmentId || !date) return new Response("Missing department or date.", { status: 400 });

  const data = await getLedgerData({
    departmentId,
    asAtDate: date,
    search: url.searchParams.get("q") ?? undefined,
    hasMovementOnly: url.searchParams.get("hasMovement") === "1",
  });

  const receivedLabel = data.department.isCentralStore ? "purchases_qty" : "received_qty";
  const issuedLabel = data.department.isCentralStore ? "requisitions_out_qty" : "sales_qty";

  const csvRows = data.rows.map((r) => ({
    product_code: r.code,
    product_name: r.name,
    opening_qty: r.openingQty,
    [receivedLabel]: r.receivedQty,
    [issuedLabel]: r.issuedQty,
    closing_qty: r.closingQty,
    unit_cost: r.unitCost,
    closing_value: r.closingValue,
  }));

  const csv = Papa.unparse(csvRows, {
    columns: ["product_code", "product_name", "opening_qty", receivedLabel, issuedLabel, "closing_qty", "unit_cost", "closing_value"],
  });

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="ledger-${data.department.name.toLowerCase().replace(/\s+/g, "-")}-${date}.csv"`,
    },
  });
}
