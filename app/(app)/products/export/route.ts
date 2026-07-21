import Papa from "papaparse";
import { getCurrentProfile } from "@/lib/auth/profile";
import { createAdminClient } from "@/lib/supabase/admin";

// Exports every product (active and inactive) in the same shape the import
// wizard accepts, so "export, edit in Excel, re-import" round-trips cleanly.
// shelf_order is deliberately left blank: a product can sit at a different
// shelf position in each department it's assigned to, so one CSV column
// can't represent all of them — and admin_import_products() only overwrites
// shelf_order when a row supplies one (COALESCE against the existing value),
// so re-importing this file leaves every department's shelf order untouched.
export async function GET() {
  const profile = await getCurrentProfile();
  if (profile.role !== "ADMIN") {
    return new Response("Forbidden", { status: 403 });
  }

  const admin = createAdminClient();
  const [{ data: products }, { data: assignments }] = await Promise.all([
    admin.from("products").select("id, code, name, unit_cost").order("code"),
    admin.from("product_assignments").select("product_id, departments(name)"),
  ]);

  const departmentsByProductId = new Map<string, string[]>();
  for (const row of assignments ?? []) {
    if (!row.departments) continue;
    const list = departmentsByProductId.get(row.product_id) ?? [];
    list.push(row.departments.name);
    departmentsByProductId.set(row.product_id, list);
  }

  const rows = (products ?? []).map((p) => ({
    code: p.code,
    name: p.name,
    unit_cost: p.unit_cost,
    departments: (departmentsByProductId.get(p.id) ?? []).sort().join(";"),
    shelf_order: "",
  }));

  const csv = Papa.unparse(rows, { columns: ["code", "name", "unit_cost", "departments", "shelf_order"] });

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="products-export-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
}
