import { getCurrentProfile } from "@/lib/auth/profile";
import { PageShell } from "@/components/app-shell/PageShell";
import { AccessDenied } from "@/components/AccessDenied";
import { Card } from "@/components/ui/Card";
import { createAdminClient } from "@/lib/supabase/admin";
import { listSalesDepartments } from "@/lib/sales/actions";
import { yesterdayIso } from "@/lib/dates";
import { SalesBatchForm } from "./SalesBatchForm";

export default async function SalesPage() {
  const profile = await getCurrentProfile();
  if (profile.role !== "ADMIN" && profile.role !== "STOREKEEPER" && profile.role !== "DEPARTMENT_USER") {
    return <AccessDenied />;
  }

  if (profile.role === "DEPARTMENT_USER") {
    if (!profile.departmentId) return <AccessDenied />;

    const admin = createAdminClient();
    const { data: department } = await admin
      .from("departments")
      .select("id, name, is_central_store")
      .eq("id", profile.departmentId)
      .maybeSingle();

    if (!department || department.is_central_store) {
      return (
        <PageShell title="Sales entry" subtitle={profile.departmentName ?? undefined}>
          <Card title="No sales for the central store">
            <div className="p-6 text-sm text-n600 leading-relaxed">
              The central store doesn&apos;t record sales — it issues requisitions to other departments instead. There&apos;s
              nothing to enter here.
            </div>
          </Card>
        </PageShell>
      );
    }

    return (
      <PageShell title="Sales entry" subtitle={`${department.name} · build a batch, then post it in one action`}>
        <SalesBatchForm
          initialBusinessDay={yesterdayIso()}
          departments={[]}
          fixedDepartment={{ id: department.id, name: department.name }}
        />
      </PageShell>
    );
  }

  const departments = await listSalesDepartments();

  return (
    <PageShell title="Sales entry" subtitle="Build a batch, then post it in one action">
      <SalesBatchForm initialBusinessDay={yesterdayIso()} departments={departments} fixedDepartment={null} />
    </PageShell>
  );
}
