import { getCurrentProfile } from "@/lib/auth/profile";
import { PageShell } from "@/components/app-shell/PageShell";
import { AccessDenied } from "@/components/AccessDenied";
import { ImportWizard } from "./ImportWizard";

export default async function ProductsImportPage() {
  const profile = await getCurrentProfile();
  if (profile.role !== "ADMIN") return <AccessDenied />;

  return (
    <PageShell title="Import products" subtitle="Dry run first, then confirm — nothing is written until you approve the preview">
      <ImportWizard />
    </PageShell>
  );
}
