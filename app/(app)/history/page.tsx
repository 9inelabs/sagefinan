import { getCurrentProfile, requireRole } from "@/lib/auth/profile";
import { PageShell } from "@/components/app-shell/PageShell";
import { PlaceholderNotice } from "@/components/PlaceholderNotice";

export default async function HistoryPage() {
  const profile = await getCurrentProfile();
  requireRole(profile, ["ADMIN", "AUDITOR"]);

  return (
    <PageShell title="History" subtitle="Every count session, searchable and exportable">
      <PlaceholderNotice phase={7} description="Count history across every department, with export." />
    </PageShell>
  );
}
