import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeftRight, ChevronRight, ClipboardCheck, PackageMinus, PackagePlus, Receipt, ShoppingBag, TrendingUp, type LucideIcon } from "lucide-react";
import { getCurrentProfile } from "@/lib/auth/profile";
import { PageShell } from "@/components/app-shell/PageShell";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { ReportsNav } from "@/components/reports/ReportsNav";
import { ReportFilterBar } from "@/components/reports/ReportFilterBar";
import { getReportsOverview, type RecentReceipt } from "@/lib/reports/actions";
import { formatNaira } from "@/lib/format";
import { formatLongDate, monthStartIso, todayIso } from "@/lib/dates";

const KIND_ICON: Record<RecentReceipt["kind"], LucideIcon> = {
  SALE: Receipt,
  REQUISITION: ArrowLeftRight,
  PURCHASE: ShoppingBag,
  ADJUSTMENT: PackageMinus,
};

function signed(n: number) {
  return n < 0 ? `−${formatNaira(n)}` : formatNaira(n);
}

export default async function ReportsOverviewPage({ searchParams }: { searchParams: Promise<{ from?: string; to?: string }> }) {
  const profile = await getCurrentProfile();
  // The overview spans every department; scoped roles start on the reports
  // they can see instead.
  if (profile.role === "DEPARTMENT_USER") redirect("/sales/history");
  if (profile.role === "STOREKEEPER") redirect("/reports/purchases");

  const sp = await searchParams;
  const from = sp.from || monthStartIso();
  const to = sp.to || todayIso();
  const o = await getReportsOverview(from, to);

  const q = `from=${from}&to=${to}`;
  const tiles: { label: string; icon: LucideIcon; href: string; value: string; lines: string[]; hero?: boolean }[] = [
    {
      label: "Sales",
      icon: Receipt,
      href: `/sales/history?${q}`,
      value: `${o.sales.quantity} bottles`,
      lines: [`${formatNaira(o.sales.value)} at cost`, `${o.sales.transactions} lines`],
      hero: true,
    },
    {
      label: "Purchases",
      icon: ShoppingBag,
      href: `/reports/purchases?${q}`,
      value: signed(o.purchases.amountPaid),
      lines: [`${o.purchases.quantity} bottles received`, `${o.purchases.transactions} lines`],
    },
    {
      label: "Requisitions",
      icon: ArrowLeftRight,
      href: `/requisitions/history?${q}`,
      value: `${o.requisitions.quantity} bottles`,
      lines: [`${formatNaira(o.requisitions.value)} at cost`, `${o.requisitions.transactions} lines`],
    },
    {
      label: "Stock removed",
      icon: PackageMinus,
      href: `/reports/adjustments?${q}`,
      value: `${o.adjustmentsRemoved.quantity} bottles`,
      lines: [`${formatNaira(o.adjustmentsRemoved.value)} at cost`, `${o.adjustmentsRemoved.transactions} adjustments`],
    },
    {
      label: "Stock added",
      icon: PackagePlus,
      href: `/reports/adjustments?${q}`,
      value: `${o.adjustmentsAdded.quantity} bottles`,
      lines: [`${formatNaira(o.adjustmentsAdded.value)} at cost`, `${o.adjustmentsAdded.transactions} adjustments`],
    },
    {
      label: "Purchase orders",
      icon: ClipboardCheck,
      href: `/reports/purchase-orders?${q}`,
      value: formatNaira(o.purchaseOrders.approvedValue),
      lines: [`${o.purchaseOrders.pending} awaiting · ${o.purchaseOrders.approved} approved`, `${o.purchaseOrders.received} received · ${o.purchaseOrders.rejected} rejected`],
    },
    {
      label: "Opening balances",
      icon: TrendingUp,
      href: `/movements?type=OPENING&${q}`,
      value: `${o.openings.quantity} bottles`,
      lines: [`${formatNaira(o.openings.value)} at cost`, `${o.openings.transactions} entries`],
    },
  ];

  return (
    <PageShell title="Reports" subtitle={`Every transaction from ${formatLongDate(from)} to ${formatLongDate(to)}`}>
      <ReportsNav active="overview" role={profile.role} />
      <ReportFilterBar basePath="/reports" initial={{ from, to }} />

      <div className="grid grid-cols-1 min-[600px]:grid-cols-2 min-[1100px]:grid-cols-4 gap-3 mb-3">
        {tiles.map((t, i) => {
          const Icon = t.icon;
          return (
            <Link
              key={t.label}
              href={t.href}
              className={`group rounded-premium p-4.5 transition-transform hover:-translate-y-px animate-rise ${
                t.hero ? "surface-hero" : "bg-white shadow-premium hover:bg-brand-hover"
              }`}
              style={{ animationDelay: `${i * 40}ms` }}
            >
              <div className="flex items-center justify-between">
                <span className={`text-[11.5px] ${t.hero ? "text-on-dark-mut" : "text-n600"}`}>{t.label}</span>
                <span className={`w-8 h-8 rounded grid place-items-center ${t.hero ? "bg-brand-bright/15 text-brand-bright" : "bg-brand-soft text-brand"}`}>
                  <Icon size={16} strokeWidth={1.75} />
                </span>
              </div>
              <p className="mt-2 text-[22px] font-medium tracking-[-0.025em] tabular-nums">{t.value}</p>
              {t.lines.map((l) => (
                <p key={l} className={`text-[11.5px] tabular-nums ${t.hero ? "text-on-dark-2" : "text-n600"}`}>
                  {l}
                </p>
              ))}
            </Link>
          );
        })}
      </div>

      <Card title="Latest receipts" extra="most recent transactions in this period — open any for the full receipt">
        {o.recent.length === 0 ? (
          <EmptyState title="No transactions in this period" description="Try a wider date range." />
        ) : (
          <ul>
            {o.recent.map((r, i) => {
              const Icon = KIND_ICON[r.kind];
              return (
                <li key={`${r.href}-${i}`} className="border-t border-n100">
                  <Link href={r.href} className="flex items-center gap-3 px-4.5 py-3 hover:bg-brand-hover">
                    <span className="w-8.5 h-8.5 rounded-full grid place-items-center bg-brand-soft text-brand flex-none">
                      <Icon size={15} strokeWidth={1.75} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <b className="block text-[12.5px] font-medium">
                        {r.title} · {r.businessDay}
                      </b>
                      <span className="block text-[11.5px] text-n600 truncate">{r.subtitle}</span>
                    </span>
                    <span className="text-right tabular-nums">
                      <b className="block text-[12.5px] font-medium">{signed(r.value)}</b>
                      <span className="block text-[11px] text-n600">{r.quantity} bottles</span>
                    </span>
                    <ChevronRight size={15} strokeWidth={1.75} className="text-n400 flex-none" />
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
      {o.capped ? <p className="text-[11.5px] text-amber mt-2">This period has more than 20,000 movements — narrow the dates for exact totals.</p> : null}
    </PageShell>
  );
}
