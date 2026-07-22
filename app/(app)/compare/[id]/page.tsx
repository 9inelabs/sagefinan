import { redirect } from "next/navigation";
import { getCurrentProfile, requireRole } from "@/lib/auth/profile";
import { PageShell } from "@/components/app-shell/PageShell";
import { getCountSessionMeta, getCompareData } from "@/lib/counts/actions";
import { CompareTable } from "./CompareTable";

export default async function CompareSessionPage({ params }: { params: Promise<{ id: string }> }) {
  const profile = await getCurrentProfile();
  requireRole(profile, ["ADMIN", "AUDITOR"]);

  const { id } = await params;
  const meta = await getCountSessionMeta(id);
  if (meta.status === "DRAFT") {
    redirect(`/count/${id}`);
  }

  const { session, lines, summary } = await getCompareData(id);

  return (
    <PageShell
      title="Compare stock"
      subtitle={`${session.departmentName} · ${summary.varianceCount} of ${summary.productsCounted} products do not tally`}
    >
      <CompareTable session={session} initialLines={lines} initialSummary={summary} />
    </PageShell>
  );
}
