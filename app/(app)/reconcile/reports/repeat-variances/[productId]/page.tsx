import Link from "next/link";
import { getCurrentProfile, requireRole } from "@/lib/auth/profile";
import { PageShell } from "@/components/app-shell/PageShell";
import { Card } from "@/components/ui/Card";
import { Tag } from "@/components/ui/Tag";
import { EmptyState } from "@/components/ui/EmptyState";
import { getRepeatVarianceProductHistory } from "@/lib/reconcile/actions";
import { formatNaira } from "@/lib/format";

type SearchParams = { department?: string; from?: string; to?: string };

export default async function RepeatVarianceProductPage({
  params,
  searchParams,
}: {
  params: Promise<{ productId: string }>;
  searchParams: Promise<SearchParams>;
}) {
  const profile = await getCurrentProfile();
  requireRole(profile, ["ADMIN", "AUDITOR"]);
  const { productId } = await params;
  const sp = await searchParams;
  if (!sp.department || !sp.from || !sp.to) {
    return (
      <PageShell title="Variance history">
        <Card title="Variance history">
          <EmptyState title="Missing filters" description="Open this page from the Repeat variances report." />
        </Card>
      </PageShell>
    );
  }

  const { productCode, productName, departmentName, rows } = await getRepeatVarianceProductHistory({
    productId,
    departmentId: sp.department,
    from: sp.from,
    to: sp.to,
  });

  const backSp = new URLSearchParams();
  backSp.set("department", sp.department);
  backSp.set("from", sp.from);
  backSp.set("to", sp.to);

  return (
    <PageShell
      title={productName || "Variance history"}
      subtitle={`${productCode} · ${departmentName} · session by session, ${sp.from} – ${sp.to}`}
      actions={
        <Link href={`/reconcile/reports/repeat-variances?${backSp.toString()}`}>
          <button className="px-[13px] py-[7px] rounded border border-n200 text-sm hover:bg-n50 hover:border-n400">← Back to report</button>
        </Link>
      }
    >
      <Card title="Variance history" extra={`${rows.length} session${rows.length === 1 ? "" : "s"}`}>
        {rows.length === 0 ? (
          <EmptyState title="No variances in range" description="This product tallied in every finished session in this range." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr>
                  {["As at", "Expected", "Counted", "Variance", "Value", "Status"].map((h, i) => (
                    <th
                      key={h}
                      className={`text-[11.5px] font-medium text-n600 text-left px-4 py-2 border-b border-n200 bg-n50 uppercase tracking-wide whitespace-nowrap ${
                        i > 0 && i < 5 ? "text-right" : ""
                      }`}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.sessionId} className="border-b border-n200 last:border-b-0 hover:bg-n50">
                    <td className="px-0 h-9">
                      <Link href={`/reconcile/${r.sessionId}`} className="flex items-center h-9 px-4 text-[13.5px] tabular-nums whitespace-nowrap">
                        {r.asAtDate}
                      </Link>
                    </td>
                    <td className="px-4 h-9 text-[13.5px] text-right tabular-nums whitespace-nowrap">{r.expectedQty}</td>
                    <td className="px-4 h-9 text-[13.5px] text-right tabular-nums whitespace-nowrap">{r.countedQty}</td>
                    <td
                      className={`px-4 h-9 text-[13.5px] text-right tabular-nums whitespace-nowrap ${
                        r.variance < 0 ? "text-red font-medium" : "text-green font-medium"
                      }`}
                    >
                      {r.variance > 0 ? `+${r.variance}` : r.variance}
                    </td>
                    <td className="px-4 h-9 text-[13.5px] text-right tabular-nums whitespace-nowrap">{formatNaira(r.value)}</td>
                    <td className="px-4 h-9 whitespace-nowrap">
                      <Tag variant={r.status === "LOCKED" ? "mut" : "warn"}>{r.status === "LOCKED" ? "Locked" : "Needs reconciling"}</Tag>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </PageShell>
  );
}
