import { getCurrentProfile } from "@/lib/auth/profile";
import { PageShell } from "@/components/app-shell/PageShell";
import { PlaceholderNotice } from "@/components/PlaceholderNotice";

export default async function LedgerPage() {
  await getCurrentProfile();

  return (
    <PageShell title="Stock ledger" subtitle="Opening, movements and closing as at a given date">
      <PlaceholderNotice
        phase={7}
        description="Opening/received/issued/closing per product, powered by get_department_balance — with the product column pinned while the rest scrolls."
      />
    </PageShell>
  );
}
