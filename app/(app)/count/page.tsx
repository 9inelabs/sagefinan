import { getCurrentProfile, requireRole } from "@/lib/auth/profile";
import { PageShell } from "@/components/app-shell/PageShell";
import { listCountDepartments } from "@/lib/counts/actions";
import { yesterdayIso } from "@/lib/dates";
import { StartCountForm } from "./StartCountForm";

export default async function CountPage() {
  const profile = await getCurrentProfile();
  requireRole(profile, ["ADMIN", "AUDITOR"]);

  const departments = await listCountDepartments();

  return (
    <PageShell title="Take stock" subtitle="Choose a department and an as-at date to start or open a count">
      <StartCountForm departments={departments} initialAsAtDate={yesterdayIso()} />
    </PageShell>
  );
}
