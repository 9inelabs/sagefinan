import { getCurrentProfile } from "@/lib/auth/profile";
import { createAdminClient } from "@/lib/supabase/admin";
import { PageShell } from "@/components/app-shell/PageShell";
import { Card } from "@/components/ui/Card";
import { AccessDenied } from "@/components/AccessDenied";
import { ProductForm } from "../ProductForm";

export default async function NewProductPage() {
  const profile = await getCurrentProfile();
  if (profile.role !== "ADMIN") return <AccessDenied />;

  const admin = createAdminClient();
  const { data: departments } = await admin.from("departments").select("id, name").eq("is_active", true).order("name");

  return (
    <PageShell title="Add product" subtitle="Products">
      <Card title="New product">
        <ProductForm departments={departments ?? []} />
      </Card>
    </PageShell>
  );
}
