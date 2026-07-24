import Link from "next/link";
import { getCurrentProfile } from "@/lib/auth/profile";
import { PageShell } from "@/components/app-shell/PageShell";
import { Card } from "@/components/ui/Card";
import { Tag } from "@/components/ui/Tag";
import { EmptyState } from "@/components/ui/EmptyState";
import { listLedgerDepartments, getLedgerProductHistory } from "@/lib/ledger/actions";
import type { MovementType } from "@/lib/movements/actions";

const TYPE_LABEL: Record<MovementType, string> = {
  PURCHASE: "Purchase",
  REQUISITION: "Requisition",
  SALE: "Sale",
  OPENING: "Opening balance",
};

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
}

type SearchParams = { department?: string; date?: string; q?: string; hasMovement?: string };

export default async function LedgerProductHistoryPage({
  params,
  searchParams,
}: {
  params: Promise<{ productId: string }>;
  searchParams: Promise<SearchParams>;
}) {
  await getCurrentProfile();
  const { productId } = await params;
  const sp = await searchParams;

  const departments = await listLedgerDepartments();
  const departmentId = departments.find((d) => d.id === sp.department)?.id ?? departments[0]?.id;
  if (!departmentId) {
    return (
      <PageShell title="Movement history">
        <Card title="Movement history">
          <EmptyState title="No department to show" description="You aren't assigned to an active department yet." />
        </Card>
      </PageShell>
    );
  }
  const asAtDate = sp.date ?? new Date().toISOString().slice(0, 10);

  const { productCode, productName, rows } = await getLedgerProductHistory({ departmentId, productId, asAtDate });

  const backSp = new URLSearchParams();
  backSp.set("department", departmentId);
  backSp.set("date", asAtDate);
  if (sp.q) backSp.set("q", sp.q);
  if (sp.hasMovement) backSp.set("hasMovement", sp.hasMovement);

  return (
    <PageShell
      title={productName}
      subtitle={`${productCode} · every movement behind the closing figure as at ${asAtDate}`}
      actions={
        <Link href={`/ledger?${backSp.toString()}`}>
          <button className="px-[13px] py-[7px] rounded border border-n200 text-sm hover:bg-n50 hover:border-n400">← Back to ledger</button>
        </Link>
      }
    >
      <Card title="Movements" extra={`${rows.length} record${rows.length === 1 ? "" : "s"}`}>
        {rows.length === 0 ? (
          <EmptyState title="No movements yet" description="Nothing has been posted for this product in this department." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr>
                  {["Business day", "Time", "Type", "Direction", "Counterparty", "Qty", "By", "Flags"].map((h, i) => (
                    <th
                      key={h}
                      className={`text-[11.5px] font-medium text-n600 text-left px-4 py-2 border-b border-n200 bg-n50 uppercase tracking-wide whitespace-nowrap ${
                        i === 5 ? "text-right" : ""
                      }`}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((m) => (
                  <tr key={m.id} className={`border-b border-n200 last:border-b-0 hover:bg-n50 ${m.isReversed ? "opacity-60" : ""}`}>
                    <td className="px-4 h-9 text-[13.5px] tabular-nums whitespace-nowrap">{m.businessDay}</td>
                    <td className="px-4 h-9 text-[13.5px] text-n600 tabular-nums whitespace-nowrap">{formatTime(m.createdAt)}</td>
                    <td className="px-4 h-9 text-[13.5px] whitespace-nowrap">{TYPE_LABEL[m.type]}</td>
                    <td className="px-4 h-9 text-[13.5px] whitespace-nowrap">
                      <span className={m.direction === "in" ? "text-green" : "text-red"}>{m.direction === "in" ? "In" : "Out"}</span>
                    </td>
                    <td className="px-4 h-9 text-[13.5px] text-n600 whitespace-nowrap">{m.counterpartyName ?? "—"}</td>
                    <td className="px-4 h-9 text-[13.5px] text-right tabular-nums font-medium whitespace-nowrap">{m.quantity}</td>
                    <td className="px-4 h-9 text-[13.5px] text-n600 whitespace-nowrap">{m.createdByName}</td>
                    <td className="px-4 h-9 whitespace-nowrap">
                      <div className="flex gap-1.5">
                        {m.isReversal ? <Tag variant="mut">Reversal</Tag> : null}
                        {m.isReversed ? <Tag variant="bad">Reversed</Tag> : null}
                      </div>
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
