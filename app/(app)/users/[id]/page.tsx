import { notFound } from "next/navigation";
import { getCurrentProfile } from "@/lib/auth/profile";
import { createAdminClient } from "@/lib/supabase/admin";
import { PageShell } from "@/components/app-shell/PageShell";
import { Card } from "@/components/ui/Card";
import { AccessDenied } from "@/components/AccessDenied";
import { EditUserForm } from "../EditUserForm";

export default async function UserDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const profile = await getCurrentProfile();
  if (profile.role !== "ADMIN") return <AccessDenied />;

  const { id } = await params;
  const admin = createAdminClient();

  const [{ data: userProfile }, { data: departments }, { data: authUser }] = await Promise.all([
    admin.from("profiles").select("id, full_name, role, department_id, is_active").eq("id", id).single(),
    admin.from("departments").select("id, name, is_central_store").eq("is_active", true).order("name"),
    admin.auth.admin.getUserById(id),
  ]);

  if (!userProfile) notFound();

  const centralStoreId = (departments ?? []).find((d) => d.is_central_store)?.id ?? null;

  return (
    <PageShell title={userProfile.full_name} subtitle="Edit user">
      <Card title="Edit user">
        <EditUserForm
          user={{
            id: userProfile.id,
            fullName: userProfile.full_name,
            email: authUser.user?.email ?? "—",
            role: userProfile.role,
            departmentId: userProfile.department_id,
            isActive: userProfile.is_active,
          }}
          departments={departments ?? []}
          centralStoreId={centralStoreId}
          isSelf={userProfile.id === profile.id}
        />
      </Card>
    </PageShell>
  );
}
