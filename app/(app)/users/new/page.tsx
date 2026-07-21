import { getCurrentProfile } from "@/lib/auth/profile";
import { createAdminClient } from "@/lib/supabase/admin";
import { PageShell } from "@/components/app-shell/PageShell";
import { Card } from "@/components/ui/Card";
import { AccessDenied } from "@/components/AccessDenied";
import { CreateUserForm } from "../CreateUserForm";

export default async function NewUserPage() {
  const profile = await getCurrentProfile();
  if (profile.role !== "ADMIN") return <AccessDenied />;

  const admin = createAdminClient();
  const { data: departments } = await admin.from("departments").select("id, name, is_central_store").eq("is_active", true).order("name");
  const centralStoreId = (departments ?? []).find((d) => d.is_central_store)?.id ?? null;

  return (
    <PageShell title="Add user" subtitle="Users">
      <Card title="New user">
        <CreateUserForm departments={departments ?? []} centralStoreId={centralStoreId} />
      </Card>
    </PageShell>
  );
}
