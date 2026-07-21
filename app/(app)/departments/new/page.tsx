import { getCurrentProfile } from "@/lib/auth/profile";
import { PageShell } from "@/components/app-shell/PageShell";
import { Card } from "@/components/ui/Card";
import { AccessDenied } from "@/components/AccessDenied";
import { DepartmentForm } from "../DepartmentForm";

export default async function NewDepartmentPage() {
  const profile = await getCurrentProfile();
  if (profile.role !== "ADMIN") return <AccessDenied />;

  return (
    <PageShell title="Add department" subtitle="Departments">
      <Card title="New department">
        <DepartmentForm />
      </Card>
    </PageShell>
  );
}
