import Link from "next/link";
import { getCurrentProfile, requireRole } from "@/lib/auth/profile";
import { PageShell } from "@/components/app-shell/PageShell";
import { Card } from "@/components/ui/Card";
import { Btn } from "@/components/ui/Button";
import { Tag } from "@/components/ui/Tag";
import { EmptyState } from "@/components/ui/EmptyState";
import { listCountSessions } from "@/lib/counts/actions";
import { formatNaira } from "@/lib/format";

export default async function ReconcilePage() {
  const profile = await getCurrentProfile();
  requireRole(profile, ["ADMIN", "AUDITOR"]);

  const { rows } = await listCountSessions({ statuses: ["COMPLETED", "LOCKED"] }, 1);
  const needsReconciling = rows.filter((r) => r.status === "COMPLETED");
  const locked = rows.filter((r) => r.status === "LOCKED");

  return (
    <PageShell
      title="Reconcile"
      subtitle="Assign a reason to each variance, then lock"
      actions={
        <div className="flex gap-2">
          <Link href="/reconcile/investigation">
            <Btn>Under investigation</Btn>
          </Link>
          <Link href="/reconcile/reports">
            <Btn>Reports</Btn>
          </Link>
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        <Card title="Needs reconciling" extra={`${needsReconciling.length} session${needsReconciling.length === 1 ? "" : "s"}`}>
          {needsReconciling.length === 0 ? (
            <EmptyState
              title="Nothing outstanding"
              description="Finish a count from Take stock and, once compared, it will appear here to reconcile."
              action={
                <Link href="/compare" className="text-teal text-sm">
                  Go to Compare stock →
                </Link>
              }
            />
          ) : (
            <SessionTable rows={needsReconciling} />
          )}
        </Card>

        <Card title="Locked sessions" extra={`${locked.length} session${locked.length === 1 ? "" : "s"}`}>
          {locked.length === 0 ? (
            <EmptyState title="No locked sessions yet" description="Locked sessions stay reachable here for post-lock adjustments and their audit trail." />
          ) : (
            <SessionTable rows={locked} />
          )}
        </Card>
      </div>
    </PageShell>
  );
}

function SessionTable({
  rows,
}: {
  rows: {
    id: string;
    departmentName: string;
    asAtDate: string;
    countedByName: string;
    productCount: number;
    varianceCount: number | null;
    varianceValue: number | null;
    status: "DRAFT" | "COMPLETED" | "LOCKED";
  }[];
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse">
        <thead>
          <tr>
            {["As at", "Department", "Counted by", "Products", "Variances", "Value", "Status"].map((h, i) => (
              <th
                key={h}
                className={`text-[11.5px] font-medium text-n600 text-left px-4 py-2 border-b border-n200 bg-n50 uppercase tracking-wide whitespace-nowrap ${
                  i > 2 && i < 6 ? "text-right" : ""
                }`}
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const netSign = (r.varianceValue ?? 0) < 0 ? "−" : (r.varianceValue ?? 0) > 0 ? "+" : "";
            return (
              <tr key={r.id} className="border-b border-n200 last:border-b-0 hover:bg-n50">
                <td className="px-0 h-9">
                  <Link href={`/reconcile/${r.id}`} className="flex items-center h-9 px-4 text-[13.5px] tabular-nums whitespace-nowrap">
                    {r.asAtDate}
                  </Link>
                </td>
                <td className="px-4 h-9 text-[13.5px] whitespace-nowrap">{r.departmentName}</td>
                <td className="px-4 h-9 text-[13.5px] text-n600 whitespace-nowrap">{r.countedByName}</td>
                <td className="px-4 h-9 text-[13.5px] text-right tabular-nums whitespace-nowrap">{r.productCount}</td>
                <td
                  className={`px-4 h-9 text-[13.5px] text-right tabular-nums whitespace-nowrap ${
                    (r.varianceCount ?? 0) > 0 ? "text-red font-medium" : ""
                  }`}
                >
                  {r.varianceCount ?? "—"}
                </td>
                <td
                  className={`px-4 h-9 text-[13.5px] text-right tabular-nums whitespace-nowrap ${
                    (r.varianceValue ?? 0) < 0 ? "text-red font-medium" : (r.varianceValue ?? 0) > 0 ? "text-green font-medium" : ""
                  }`}
                >
                  {r.varianceValue == null ? "—" : `${netSign}${formatNaira(r.varianceValue)}`}
                </td>
                <td className="px-4 h-9 whitespace-nowrap">
                  <Tag variant={r.status === "LOCKED" ? "mut" : "warn"}>{r.status === "LOCKED" ? "Locked" : "Needs reconciling"}</Tag>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
