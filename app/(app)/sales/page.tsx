import { getCurrentProfile, requireRole } from "@/lib/auth/profile";
import { PageShell } from "@/components/app-shell/PageShell";
import { PlaceholderNotice } from "@/components/PlaceholderNotice";

export default async function SalesPage() {
  const profile = await getCurrentProfile();
  requireRole(profile, ["ADMIN", "DEPARTMENT_USER"]);

  return (
    <PageShell title="Sales entry" subtitle="Build a batch, then post it in one action">
      <PlaceholderNotice
        phase={4}
        description="Search a product, enter the day's sales, add it to a batch, then post everything in one action."
      />
    </PageShell>
  );
}
