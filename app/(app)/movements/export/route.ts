import Papa from "papaparse";
import { getCurrentProfile } from "@/lib/auth/profile";
import { listMovementsForExport, type MovementFilters, type MovementType } from "@/lib/movements/actions";

export async function GET(request: Request) {
  await getCurrentProfile();

  const url = new URL(request.url);
  const filters: MovementFilters = {
    q: url.searchParams.get("q") ?? undefined,
    type: (url.searchParams.get("type") as MovementType | null) ?? undefined,
    departmentId: url.searchParams.get("department") ?? undefined,
    businessDayFrom: url.searchParams.get("from") ?? undefined,
    businessDayTo: url.searchParams.get("to") ?? undefined,
    overrideOnly: url.searchParams.get("override") === "1",
  };

  const rows = await listMovementsForExport(filters);

  const csvRows = rows.map((m) => ({
    business_day: m.businessDay,
    time_recorded: new Date(m.createdAt).toISOString(),
    type: m.type,
    product_code: m.productCode,
    product_name: m.productName,
    from_department: m.fromDepartmentName ?? "",
    to_department: m.toDepartmentName ?? "",
    quantity: m.quantity,
    entered_by: m.createdByName,
    received_by: m.receivedByName ?? "",
    override: m.isOverride ? "yes" : "",
    reversal: m.isReversal ? "yes" : "",
    reversed: m.isReversed ? "yes" : "",
  }));

  const csv = Papa.unparse(csvRows, {
    columns: [
      "business_day",
      "time_recorded",
      "type",
      "product_code",
      "product_name",
      "from_department",
      "to_department",
      "quantity",
      "entered_by",
      "received_by",
      "override",
      "reversal",
      "reversed",
    ],
  });

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="movements-export-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
}
