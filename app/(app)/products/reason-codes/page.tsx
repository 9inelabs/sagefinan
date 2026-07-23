import { getCurrentProfile } from "@/lib/auth/profile";
import { PageShell } from "@/components/app-shell/PageShell";
import { AccessDenied } from "@/components/AccessDenied";
import { listReasonCodes } from "@/lib/reason-codes/actions";
import { ReasonCodesManager } from "./ReasonCodesManager";

export default async function ReasonCodesPage() {
  const profile = await getCurrentProfile();
  if (profile.role !== "ADMIN") return <AccessDenied />;

  const codes = await listReasonCodes(true);

  return (
    <PageShell title="Reason codes" subtitle="The fixed set of reasons auditors can attach to a variance during reconciliation">
      <ReasonCodesManager initialCodes={codes} />
    </PageShell>
  );
}
