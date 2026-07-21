import { getCurrentProfile, requireRole } from "@/lib/auth/profile";
import { PageShell } from "@/components/app-shell/PageShell";
import { PlaceholderNotice } from "@/components/PlaceholderNotice";

export default async function ReconcilePage() {
  const profile = await getCurrentProfile();
  requireRole(profile, ["ADMIN", "AUDITOR"]);

  return (
    <PageShell title="Reconcile" subtitle="Assign a reason to each variance, then lock">
      <PlaceholderNotice
        phase={6}
        description="Reconciliation, reason codes and session locking — once locked, corrections are recorded as adjustments, never overwrites."
      />
    </PageShell>
  );
}
