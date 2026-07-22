import { getCurrentProfile, requireRole } from "@/lib/auth/profile";
import { PageShell } from "@/components/app-shell/PageShell";
import { getCountLinesForCounting } from "@/lib/counts/actions";
import { TakeStockScreen } from "./TakeStockScreen";

export default async function CountSessionPage({ params }: { params: Promise<{ id: string }> }) {
  const profile = await getCurrentProfile();
  requireRole(profile, ["ADMIN", "AUDITOR"]);

  const { id } = await params;
  // getCountLinesForCounting deliberately never selects expected_qty — see
  // lib/counts/actions.ts — so loading it here, server-side, doesn't violate
  // blind counting; it just saves the client an extra round trip on load.
  const { session, lines } = await getCountLinesForCounting(id);

  return (
    <PageShell
      title="Take stock"
      subtitle={`${session.departmentName} · physical count · as at close of ${session.asAtDate}`}
    >
      <TakeStockScreen session={session} initialLines={lines} />
    </PageShell>
  );
}
