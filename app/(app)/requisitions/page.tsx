import { getCurrentProfile, requireRole } from "@/lib/auth/profile";
import { PageShell } from "@/components/app-shell/PageShell";
import { PlaceholderNotice } from "@/components/PlaceholderNotice";

export default async function RequisitionsPage() {
  const profile = await getCurrentProfile();
  requireRole(profile, ["ADMIN", "STOREKEEPER"]);

  return (
    <PageShell title="Requisitions" subtitle="Central store · movements to departments">
      <PlaceholderNotice
        phase={3}
        description="One entry moves stock out of central store and into a department at the same time — a single record, so the two sides can never disagree."
      />
    </PageShell>
  );
}
