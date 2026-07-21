import { notFound } from "next/navigation";
import { getCurrentProfile } from "@/lib/auth/profile";
import { createAdminClient } from "@/lib/supabase/admin";
import { PageShell } from "@/components/app-shell/PageShell";
import { Card } from "@/components/ui/Card";
import { AccessDenied } from "@/components/AccessDenied";
import { ProductForm } from "../ProductForm";

export default async function ProductDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const profile = await getCurrentProfile();
  if (profile.role !== "ADMIN") return <AccessDenied />;

  const { id } = await params;
  const admin = createAdminClient();

  const [{ data: product }, { data: departments }, { data: assignments }] = await Promise.all([
    admin.from("products").select("id, code, name, unit_cost").eq("id", id).single(),
    admin.from("departments").select("id, name").eq("is_active", true).order("name"),
    admin.from("product_assignments").select("department_id").eq("product_id", id),
  ]);

  if (!product) notFound();

  return (
    <PageShell title={product.name} subtitle={`Product · ${product.code}`}>
      <Card title="Edit product">
        <ProductForm
          product={{ id: product.id, code: product.code, name: product.name, unitCost: product.unit_cost }}
          departments={departments ?? []}
          initialDepartmentIds={(assignments ?? []).map((a) => a.department_id)}
        />
      </Card>
    </PageShell>
  );
}
