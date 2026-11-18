import { Download } from "lucide-react";
import { getCurrentProfile } from "@/lib/auth/profile";
import { PageShell } from "@/components/app-shell/PageShell";
import { AccessDenied } from "@/components/AccessDenied";
import { Stat } from "@/components/ui/Stat";
import { Btn } from "@/components/ui/Button";
import { ReportsNav } from "@/components/reports/ReportsNav";
import { ReportFilterBar } from "@/components/reports/ReportFilterBar";
import { AdjustmentList } from "@/components/adjustments/AdjustmentList";
import { listAdjustments } from "@/lib/adjustments/actions";
import { listDashboardDepartments } from "@/lib/dashboard/actions";
import { formatNaira } from "@/lib/format";
import { monthStartIso, todayIso } from "@/lib/dates";

export default async function AdjustmentsReportPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string; q?: string; department?: string }>;
}) {
  const profile = await getCurrentProfile();
  if (profile.role !== "ADMIN" && profile.role !== "AUDITOR") return <AccessDenied />;

  const sp = await searchParams;
  const from = sp.from || monthStartIso();
  const to = sp.to || todayIso();
  const [rows, departments] = await Promise.all([
    listAdjustments({ from, to, q: sp.q, departmentId: sp.department }),
    listDashboardDepartments(),
  ]);
  const removed = rows.filter((r) => r.delta < 0);
  const added = rows.filter((r) => r.delta > 0);
  const exportQs = new URLSearchParams({ type: "ADJUSTMENT", from, to, ...(sp.q ? { q: sp.q } : {}), ...(sp.department ? { department: sp.department } : {}) });

  return (
    <PageShell
      title="Adjustments"
      subtitle="Stock removed or added outside sales and transfers — expired, damaged, found — with reasons"
      actions={
        <a href={`/movements/export?${exportQs.toString()}`}>
          <Btn>
            <Download size={14} strokeWidth={1.8} />
            Export CSV
          </Btn>
        </a>
      }
    >
      <ReportsNav active="adjustments" role={profile.role} />
      <ReportFilterBar
        basePath="/reports/adjustments"
        initial={{ from, to, q: sp.q, department: sp.department }}
        searchPlaceholder="Product name or code"
        departments={departments.map((d) => ({ value: d.id, label: d.name }))}
      />
      <div className="grid grid-cols-2 min-[900px]:grid-cols-4 gap-3 mb-3">
        <Stat
          variant="hero"
          label="Net value at cost"
          value={`${rows.reduce((s, r) => s + r.value, 0) < 0 ? "−" : ""}${formatNaira(rows.reduce((s, r) => s + r.value, 0))}`}
          footer={`${rows.length} adjustment${rows.length === 1 ? "" : "s"}`}
        />
        <Stat label="Bottles removed" value={String(-removed.reduce((s, r) => s + r.delta, 0))} colorClassName="text-red" footer={formatNaira(removed.reduce((s, r) => s + r.value, 0))} />
        <Stat label="Bottles added" value={String(added.reduce((s, r) => s + r.delta, 0))} colorClassName="text-green" footer={formatNaira(added.reduce((s, r) => s + r.value, 0))} />
        <Stat label="Departments affected" value={String(new Set(rows.map((r) => r.departmentId)).size)} />
      </div>
      <AdjustmentList rows={rows} title="Adjustments" extra={`${rows.length} in this period`} />
    </PageShell>
  );
}
