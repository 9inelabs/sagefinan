import Link from "next/link";
import { getCurrentProfile } from "@/lib/auth/profile";
import { createAdminClient } from "@/lib/supabase/admin";
import { PageShell } from "@/components/app-shell/PageShell";
import { Card } from "@/components/ui/Card";
import { Btn } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { AccessDenied } from "@/components/AccessDenied";
import { ProductsFilters } from "./ProductsFilters";
import { ProductsTable } from "./ProductsTable";

const PAGE_SIZE = 50;

export default async function ProductsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; department?: string; status?: string; page?: string }>;
}) {
  const profile = await getCurrentProfile();
  if (profile.role !== "ADMIN") return <AccessDenied />;

  const params = await searchParams;
  const q = (params.q ?? "").trim();
  const departmentId = params.department ?? "";
  const status = params.status === "inactive" || params.status === "all" ? params.status : "active";
  const page = Math.max(1, Number(params.page) || 1);

  const admin = createAdminClient();

  const { data: departments } = await admin
    .from("departments")
    .select("id, name")
    .eq("is_active", true)
    .order("name");

  let productIdsInDepartment: string[] | null = null;
  if (departmentId) {
    const { data: assigned } = await admin.from("product_assignments").select("product_id").eq("department_id", departmentId);
    productIdsInDepartment = (assigned ?? []).map((r) => r.product_id);
  }

  let query = admin.from("products").select("id, code, name, unit_cost, is_active", { count: "exact" });
  if (status !== "all") query = query.eq("is_active", status === "active");
  if (q) query = query.or(`code.ilike.%${q}%,name.ilike.%${q}%`);
  if (productIdsInDepartment !== null) {
    query = productIdsInDepartment.length > 0 ? query.in("id", productIdsInDepartment) : query.eq("id", "00000000-0000-0000-0000-000000000000");
  }

  const from = (page - 1) * PAGE_SIZE;
  const { data: products, count } = await query.order("code").range(from, from + PAGE_SIZE - 1);

  const productIds = (products ?? []).map((p) => p.id);
  const departmentNamesByProduct = new Map<string, string[]>();
  if (productIds.length > 0) {
    const { data: rows } = await admin
      .from("product_assignments")
      .select("product_id, departments(name)")
      .in("product_id", productIds);
    for (const row of rows ?? []) {
      const list = departmentNamesByProduct.get(row.product_id) ?? [];
      if (row.departments) list.push(row.departments.name);
      departmentNamesByProduct.set(row.product_id, list);
    }
  }

  const totalCount = count ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  const hasAnyProducts = totalCount > 0 || q || departmentId || status !== "active";

  const rows = (products ?? []).map((p) => ({
    id: p.id,
    code: p.code,
    name: p.name,
    unitCost: p.unit_cost,
    isActive: p.is_active,
    departments: (departmentNamesByProduct.get(p.id) ?? []).sort(),
  }));

  return (
    <PageShell
      title="Products"
      subtitle="Product master and department assignments"
      actions={
        <div className="flex gap-2">
          <Link href="/products/reason-codes">
            <Btn>Reason codes</Btn>
          </Link>
          <Link href="/products/export">
            <Btn>Export CSV</Btn>
          </Link>
          <Link href="/products/import">
            <Btn>Import CSV</Btn>
          </Link>
          <Link href="/products/new">
            <Btn variant="acc">Add product</Btn>
          </Link>
        </div>
      }
    >
      <Card title="Products" extra={`${totalCount} ${status === "all" ? "" : status} shown`}>
        <ProductsFilters departments={departments ?? []} initialQ={q} initialDepartment={departmentId} initialStatus={status} />

        {rows.length === 0 ? (
          hasAnyProducts ? (
            <EmptyState title="No products match" description="Try a different search term or clear the filters." />
          ) : (
            <EmptyState
              title="No products yet"
              description="Import your spreadsheet to add roughly 1,000 products at once, or add a single product."
              action={
                <div className="flex gap-2 justify-center">
                  <Link href="/products/import">
                    <Btn variant="acc">Import CSV</Btn>
                  </Link>
                  <Link href="/products/new">
                    <Btn>Add product</Btn>
                  </Link>
                </div>
              }
            />
          )
        ) : (
          <ProductsTable products={rows} departments={departments ?? []} />
        )}

        {totalPages > 1 ? (
          <div className="px-4 py-3 border-t border-n200 flex items-center justify-between text-sm">
            <span className="text-n600">
              Page {page} of {totalPages}
            </span>
            <div className="flex gap-2">
              <PageLink params={params} page={page - 1} disabled={page <= 1}>
                Previous
              </PageLink>
              <PageLink params={params} page={page + 1} disabled={page >= totalPages}>
                Next
              </PageLink>
            </div>
          </div>
        ) : null}
      </Card>
    </PageShell>
  );
}

function PageLink({
  params,
  page,
  disabled,
  children,
}: {
  params: { q?: string; department?: string; status?: string };
  page: number;
  disabled: boolean;
  children: React.ReactNode;
}) {
  if (disabled) {
    return <span className="px-3 py-1.5 rounded border border-n200 text-n400">{children}</span>;
  }
  const sp = new URLSearchParams();
  if (params.q) sp.set("q", params.q);
  if (params.department) sp.set("department", params.department);
  if (params.status) sp.set("status", params.status);
  sp.set("page", String(page));
  return (
    <Link href={`/products?${sp.toString()}`} className="px-3 py-1.5 rounded border border-n200 hover:bg-n50 hover:border-n400">
      {children}
    </Link>
  );
}
