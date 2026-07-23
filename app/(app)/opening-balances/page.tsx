import Link from "next/link";
import { getCurrentProfile } from "@/lib/auth/profile";
import { PageShell } from "@/components/app-shell/PageShell";
import { Btn } from "@/components/ui/Button";
import { AccessDenied } from "@/components/AccessDenied";
import { listOpeningBalanceDepartments, getOpeningBalanceScreenData } from "@/lib/opening-balances/actions";
import { OpeningBalanceForm } from "./OpeningBalanceForm";

export default async function OpeningBalancesPage({ searchParams }: { searchParams: Promise<{ department?: string }> }) {
  const profile = await getCurrentProfile();
  if (profile.role !== "ADMIN") return <AccessDenied />;

  const params = await searchParams;
  const departments = await listOpeningBalanceDepartments();
  const departmentId = params.department && departments.some((d) => d.id === params.department) ? params.department : departments[0]?.id;

  const screenData = departmentId ? await getOpeningBalanceScreenData(departmentId) : null;

  return (
    <PageShell
      title="Opening balances"
      subtitle="Stock physically on the shelf at the start, before real counting begins"
      actions={
        <div className="flex gap-2">
          <Link href="/opening-balances/export">
            <Btn>Export CSV</Btn>
          </Link>
          <Link href="/opening-balances/import">
            <Btn variant="acc">Import CSV</Btn>
          </Link>
        </div>
      }
    >
      <OpeningBalanceForm departments={departments} selectedDepartmentId={departmentId ?? null} screenData={screenData} />
    </PageShell>
  );
}
