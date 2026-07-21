import { getCurrentProfile, requireRole } from "@/lib/auth/profile";
import { PageShell } from "@/components/app-shell/PageShell";
import { PlaceholderNotice } from "@/components/PlaceholderNotice";

export default async function ProductsPage() {
  const profile = await getCurrentProfile();
  requireRole(profile, ["ADMIN"]);

  return (
    <PageShell title="Products" subtitle="Product master and department assignments">
      <PlaceholderNotice
        phase={2}
        description="Admin: departments, products, CSV import, and users."
      />
    </PageShell>
  );
}
