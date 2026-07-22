import Link from "next/link";
import { getCurrentProfile, requireRole } from "@/lib/auth/profile";
import { PageShell } from "@/components/app-shell/PageShell";
import { Card } from "@/components/ui/Card";
import { Tag } from "@/components/ui/Tag";
import { EmptyState } from "@/components/ui/EmptyState";
import { listCountSessions } from "@/lib/counts/actions";
import { formatNaira } from "@/lib/format";

export default async function ComparePage() {
  const profile = await getCurrentProfile();
  requireRole(profile, ["ADMIN", "AUDITOR"]);

  const { rows } = await listCountSessions({ statuses: ["COMPLETED", "LOCKED"] }, 1);

  return (
    <PageShell title="Compare stock" subtitle="Finished counts, ready to compare against expected figures">
      <Card title="Ready to compare" extra={`${rows.length} session${rows.length === 1 ? "" : "s"}`}>
        {rows.length === 0 ? (
          <EmptyState
            title="Nothing to compare yet"
            description="Finish a count from Take stock and it will appear here."
            action={
              <Link href="/count" className="text-teal text-sm">
                Go to Take stock →
              </Link>
            }
          />
        ) : (
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
                        <Link href={`/compare/${r.id}`} className="flex items-center h-9 px-4 text-[13.5px] tabular-nums whitespace-nowrap">
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
        )}
      </Card>
    </PageShell>
  );
}
