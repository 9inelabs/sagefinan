import { getCurrentProfile } from "@/lib/auth/profile";
import { PageShell } from "@/components/app-shell/PageShell";
import { AccessDenied } from "@/components/AccessDenied";
import { ImportWizard } from "./ImportWizard";

export default async function OpeningBalanceImportPage() {
  const profile = await getCurrentProfile();
  if (profile.role !== "ADMIN") return <AccessDenied />;

  return (
    <PageShell title="Import opening balances" subtitle="Dry run first — nothing is written until you confirm the preview">
      <ImportWizard />
    </PageShell>
  );
}
