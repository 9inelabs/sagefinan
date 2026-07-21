import { getCurrentProfile } from "@/lib/auth/profile";
import { PageShell } from "@/components/app-shell/PageShell";
import { Card } from "@/components/ui/Card";
import { Stat } from "@/components/ui/Stat";
import { Tag } from "@/components/ui/Tag";
import { Btn } from "@/components/ui/Button";
import Link from "next/link";

// Phase 1: this dashboard reproduces design/ui-draft.html's sample figures
// verbatim so the layout can be reviewed against the prototype. It is not yet
// wired to real counts/movements — that lands in phases 5-7.
export default async function DashboardPage() {
  const profile = await getCurrentProfile();

  if (profile.role === "STOREKEEPER" || profile.role === "DEPARTMENT_USER") {
    return <ScopedHome role={profile.role} departmentName={profile.departmentName} />;
  }

  return (
    <PageShell
      title="Dashboard"
      subtitle="Tuesday, 21 July 2026 · as at close of Monday, 20 July"
      actions={<Btn variant="acc">Start count</Btn>}
    >
      <div className="grid grid-cols-2 min-[900px]:grid-cols-4 gap-3 mb-4.5">
        <Stat label="Counted today" value="3" hint="/ 8" />
        <Stat label="Items with variance" value="17" colorClassName="text-red" />
        <Stat label="Variance value" value="₦48,250" colorClassName="text-red" />
        <Stat label="Awaiting reconciliation" value="2" hint="sessions" />
      </div>

      <Card title="Today's counts" extra="as at close of 20 July" className="mb-4">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr>
                {["Department", "Products", "Counted", "Variances", "Value", "Status", ""].map((h, i) => (
                  <th
                    key={h + i}
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
              {[
                { dept: "Central store", products: 312, counted: 312, variances: 6, value: "₦21,400", status: "warn" as const, statusLabel: "Needs reconciling", action: "Open", href: "/compare" },
                { dept: "Bar", products: 86, counted: 86, variances: 9, value: "₦18,900", status: "warn" as const, statusLabel: "Needs reconciling", action: "Open", href: "/compare" },
                { dept: "Kitchen", products: 124, counted: 124, variances: 2, value: "₦7,950", status: "mut" as const, statusLabel: "Locked", action: "View", href: "/history" },
                { dept: "Pool bar", products: 54, counted: null, variances: null, value: null, status: "mut" as const, statusLabel: "Not started", action: "Count", href: "/count" },
                { dept: "Restaurant", products: 98, counted: null, variances: null, value: null, status: "mut" as const, statusLabel: "Not started", action: "Count", href: "/count" },
              ].map((row) => (
                <tr key={row.dept} className="border-b border-n200 last:border-b-0 hover:bg-n50">
                  <td className="px-4 h-9 text-[13.5px] whitespace-nowrap">{row.dept}</td>
                  <td className="px-4 h-9 text-[13.5px] text-right text-n600 tabular-nums whitespace-nowrap">{row.products}</td>
                  <td className="px-4 h-9 text-[13.5px] text-right tabular-nums whitespace-nowrap">
                    {row.counted ?? <span className="text-n600">—</span>}
                  </td>
                  <td className="px-4 h-9 text-[13.5px] text-right tabular-nums whitespace-nowrap">
                    {row.variances != null ? <span className="text-red font-medium">{row.variances}</span> : <span className="text-n600">—</span>}
                  </td>
                  <td className="px-4 h-9 text-[13.5px] text-right tabular-nums whitespace-nowrap">
                    {row.value ? <span className="text-red font-medium">{row.value}</span> : <span className="text-n600">—</span>}
                  </td>
                  <td className="px-4 h-9 text-[13.5px] whitespace-nowrap">
                    <Tag variant={row.status}>{row.statusLabel}</Tag>
                  </td>
                  <td className="px-4 h-9 text-[13.5px] text-right whitespace-nowrap">
                    <Link href={row.href} className="text-teal">
                      {row.action}
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card title="Stock ledger" extra="All departments · as at 21 July 2026" className="mb-4">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr>
                {["Department", "Opening", "Received", "Issued", "Closing", "Products", ""].map((h, i) => (
                  <th
                    key={h + i}
                    className={`text-[11.5px] font-medium text-n600 text-left px-4 py-2 border-b border-n200 bg-n50 uppercase tracking-wide whitespace-nowrap ${
                      i > 0 ? "text-right" : ""
                    }`}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[
                { dept: "Central store", opening: "₦14,820,400", received: "+₦2,140,000", issued: "−₦1,986,300", closing: "₦14,974,100", products: 312 },
                { dept: "Bar", opening: "₦1,942,800", received: "+₦486,000", issued: "−₦512,400", closing: "₦1,916,400", products: 86 },
                { dept: "Kitchen", opening: "₦2,760,500", received: "+₦640,200", issued: "−₦598,900", closing: "₦2,801,800", products: 124 },
                { dept: "Pool bar", opening: "₦684,000", received: "+₦158,400", issued: "−₦171,600", closing: "₦670,800", products: 54 },
                { dept: "Restaurant", opening: "₦1,206,300", received: "+₦312,800", issued: "−₦289,400", closing: "₦1,229,700", products: 98 },
              ].map((row) => (
                <tr key={row.dept} className="border-b border-n200 last:border-b-0 hover:bg-n50">
                  <td className="px-4 h-9 text-[13.5px] whitespace-nowrap">{row.dept}</td>
                  <td className="px-4 h-9 text-[13.5px] text-right tabular-nums whitespace-nowrap">{row.opening}</td>
                  <td className="px-4 h-9 text-[13.5px] text-right text-green tabular-nums whitespace-nowrap">{row.received}</td>
                  <td className="px-4 h-9 text-[13.5px] text-right text-red tabular-nums whitespace-nowrap">{row.issued}</td>
                  <td className="px-4 h-9 text-[13.5px] text-right font-medium tabular-nums whitespace-nowrap">{row.closing}</td>
                  <td className="px-4 h-9 text-[13.5px] text-right text-n600 tabular-nums whitespace-nowrap">{row.products}</td>
                  <td className="px-4 h-9 text-[13.5px] text-right whitespace-nowrap">
                    <Link href="/ledger" className="text-teal">
                      Open
                    </Link>
                  </td>
                </tr>
              ))}
              <tr className="bg-n50">
                <td className="px-4 h-9 text-[13.5px] font-medium whitespace-nowrap">Total</td>
                <td className="px-4 h-9 text-[13.5px] font-medium text-right tabular-nums whitespace-nowrap">₦21,414,000</td>
                <td className="px-4 h-9 text-[13.5px] font-medium text-right tabular-nums whitespace-nowrap">+₦3,737,400</td>
                <td className="px-4 h-9 text-[13.5px] font-medium text-right tabular-nums whitespace-nowrap">−₦3,558,600</td>
                <td className="px-4 h-9 text-[13.5px] font-medium text-right tabular-nums whitespace-nowrap">₦21,592,800</td>
                <td className="px-4 h-9 text-[13.5px] font-medium text-right text-n600 tabular-nums whitespace-nowrap">674</td>
                <td className="px-4 h-9" />
              </tr>
            </tbody>
          </table>
        </div>
      </Card>

      <div className="grid min-[900px]:grid-cols-[1fr_300px] gap-4 items-start">
        <Card title="Repeat variances" extra="last 30 days">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr>
                  {["Product", "Department", "Days short", "Total", "Value"].map((h, i) => (
                    <th
                      key={h}
                      className={`text-[11.5px] font-medium text-n600 text-left px-4 py-2 border-b border-n200 bg-n50 uppercase tracking-wide whitespace-nowrap ${
                        i > 1 ? "text-right" : ""
                      }`}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[
                  { product: "Heineken 33cl", dept: "Bar", days: 11, total: "−34", value: "₦51,000", short: true },
                  { product: "Star Radler 33cl", dept: "Pool bar", days: 8, total: "−19", value: "₦22,800", short: true },
                  { product: "Chivas Regal 75cl", dept: "Bar", days: 5, total: "−3", value: "₦126,000", short: true },
                  { product: "Eva Water 75cl", dept: "Restaurant", days: 4, total: "+12", value: "₦4,800", short: false },
                ].map((row) => (
                  <tr key={row.product} className="border-b border-n200 last:border-b-0 hover:bg-n50">
                    <td className="px-4 h-9 text-[13.5px] whitespace-nowrap">{row.product}</td>
                    <td className="px-4 h-9 text-[13.5px] text-n600 whitespace-nowrap">{row.dept}</td>
                    <td className="px-4 h-9 text-[13.5px] text-right tabular-nums whitespace-nowrap">{row.days}</td>
                    <td className={`px-4 h-9 text-[13.5px] text-right tabular-nums whitespace-nowrap ${row.short ? "text-red font-medium" : "text-green font-medium"}`}>
                      {row.total}
                    </td>
                    <td className="px-4 h-9 text-[13.5px] text-right tabular-nums whitespace-nowrap">{row.value}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        <Card title="Movements today">
          <div>
            {[
              { type: "Requisition", time: "07:42", detail: "Central store → Bar · 24 Heineken", by: "Musa I." },
              { type: "Purchase", time: "06:15", detail: "Nigerian Breweries · 12 lines", by: "Musa I." },
              { type: "Sales posted", time: "Yesterday", detail: "Kitchen · 124 products", by: "Grace O." },
            ].map((m, i) => (
              <div key={i} className="border-b border-n200 last:border-b-0 px-4 py-[13px]">
                <div className="flex justify-between items-center">
                  <b className="font-medium text-sm">{m.type}</b>
                  <span className="text-n600 text-xs tabular-nums">{m.time}</span>
                </div>
                <div className="text-n600 text-[12.5px] mt-[3px]">{m.detail}</div>
                <div className="text-n600 text-xs mt-0.5">by {m.by}</div>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </PageShell>
  );
}

function ScopedHome({ role, departmentName }: { role: "STOREKEEPER" | "DEPARTMENT_USER"; departmentName: string | null }) {
  const shortcut =
    role === "STOREKEEPER"
      ? { label: "Go to Requisitions", href: "/requisitions" }
      : { label: "Go to Sales entry", href: "/sales" };

  return (
    <PageShell title="Sagefinan" subtitle={departmentName ?? undefined}>
      <Card title="Welcome">
        <div className="p-4 text-sm text-n600 leading-relaxed">
          <p className="mb-3">
            Signed in for <b className="text-ink font-medium">{departmentName ?? "your department"}</b>.
          </p>
          <Link href={shortcut.href} className="text-teal">
            {shortcut.label} →
          </Link>
        </div>
      </Card>
    </PageShell>
  );
}
