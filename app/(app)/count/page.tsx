import { getCurrentProfile, requireRole } from "@/lib/auth/profile";
import { PageShell } from "@/components/app-shell/PageShell";
import { PlaceholderNotice } from "@/components/PlaceholderNotice";

export default async function CountPage() {
  const profile = await getCurrentProfile();
  requireRole(profile, ["ADMIN", "AUDITOR"]);

  return (
    <PageShell title="Take stock" subtitle="Physical count · as at close of business">
      <PlaceholderNotice
        phase={5}
        description="Stock count and variance comparison — a phone-width batch entry screen where the expected quantity stays hidden until you finish counting."
      />
    </PageShell>
  );
}
