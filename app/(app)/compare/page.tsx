import { getCurrentProfile, requireRole } from "@/lib/auth/profile";
import { PageShell } from "@/components/app-shell/PageShell";
import { PlaceholderNotice } from "@/components/PlaceholderNotice";

export default async function ComparePage() {
  const profile = await getCurrentProfile();
  requireRole(profile, ["ADMIN", "AUDITOR"]);

  return (
    <PageShell title="Compare stock" subtitle="Products that don't tally against the ledger">
      <PlaceholderNotice
        phase={5}
        description="Variance comparison — physical count vs. expected vs. ledger, with only the mismatched products listed."
      />
    </PageShell>
  );
}
