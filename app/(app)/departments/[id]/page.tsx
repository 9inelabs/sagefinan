import { notFound } from "next/navigation";
import { getCurrentProfile } from "@/lib/auth/profile";
import { createAdminClient } from "@/lib/supabase/admin";
import { listDepartmentAssignments } from "@/lib/product-assignments/actions";
import { PageShell } from "@/components/app-shell/PageShell";
import { Card } from "@/components/ui/Card";
import { AccessDenied } from "@/components/AccessDenied";
import { DepartmentForm } from "../DepartmentForm";
import { DepartmentProductsManager } from "./DepartmentProductsManager";

export default async function DepartmentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const profile = await getCurrentProfile();
  if (profile.role !== "ADMIN") return <AccessDenied />;

  const { id } = await params;
  const admin = createAdminClient();
  const { data: department } = await admin
    .from("departments")
    .select("id, name, is_central_store, is_active")
    .eq("id", id)
    .single();

  if (!department) notFound();

  const assignments = await listDepartmentAssignments(id);

  return (
    <PageShell title={department.name} subtitle="Department settings, products and shelf order">
      <div className="flex flex-col gap-4">
        <Card title="Department details">
          <DepartmentForm
            department={{ id: department.id, name: department.name, isCentralStore: department.is_central_store }}
          />
        </Card>

        <Card title="Products in this department" extra={`${assignments.length} assigned`}>
          <DepartmentProductsManager departmentId={id} initialProducts={assignments} />
        </Card>
      </div>
    </PageShell>
  );
}
