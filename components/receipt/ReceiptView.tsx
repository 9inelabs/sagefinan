import Link from "next/link";
import { formatReceiptDate } from "@/lib/dates";

export type ReceiptLine = {
  id: string;
  code: string;
  name: string;
  quantity: number;
  isOverride: boolean;
  isReversal: boolean;
  isReversed: boolean;
};

// Shared by the Sales and Requisition history receipt pages (see CLAUDE.md's
// follow-up on this) — one compact, printable-feeling document matching the
// reference image exactly: a dark gradient header card (hotel branding, who/
// when/which department) above a clean white line-items card, black and
// white throughout — no colour, even for override/reversed flags, which get
// a small monochrome tag instead of this app's usual amber/red (a receipt
// stays a receipt). Server-rendered, no client interactivity needed.
export function ReceiptView({
  kind,
  businessDay,
  departmentName,
  createdByName,
  lines,
  backHref,
  pdfHref,
}: {
  kind: "Sales entry" | "Requisition";
  businessDay: string;
  departmentName: string;
  createdByName: string;
  lines: ReceiptLine[];
  backHref: string;
  pdfHref: string;
}) {
  const totalQuantity = lines.reduce((sum, l) => sum + l.quantity, 0);

  return (
    <div className="max-w-[480px] mx-auto w-full">
      <div className="flex items-center justify-between mb-4 print:hidden">
        <Link href={backHref} className="text-sm text-graphite">
          ← Back to history
        </Link>
        <Link href={pdfHref} className="text-sm px-3 py-1.5 rounded-premium border border-n200 bg-white shadow-premium hover:bg-n50">
          Export PDF
        </Link>
      </div>

      <div id="receipt-print-area">
        <div
          className="rounded-premium shadow-premium px-6 py-7 mb-4 text-center"
          style={{ background: "linear-gradient(165deg, var(--ink), #000000)" }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo-mark.png" alt="" className="w-7 h-auto mx-auto mb-3 invert" />
          <h1 className="text-white text-lg font-medium tracking-[0.14em] uppercase">De-Moon Hotel</h1>
          <p className="text-white/70 text-sm mt-2">
            {kind} · {createdByName} · {formatReceiptDate(businessDay)}
          </p>
          <p className="text-white/70 text-sm">Department · {departmentName}</p>
        </div>

        <div className="bg-white rounded-premium shadow-premium overflow-hidden">
          {lines.map((l, i) => (
            <div
              key={l.id}
              className={`flex items-center justify-between gap-3 px-5 py-3 ${i < lines.length - 1 ? "border-b border-n100" : ""}`}
            >
              <div className="min-w-0">
                <div className="text-ink text-[15px] truncate">{l.name}</div>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <span className="text-n400 text-xs tabular-nums">{l.code}</span>
                  {l.isOverride ? <span className="text-n600 text-[10px] uppercase tracking-wide border border-n200 rounded px-1">Override</span> : null}
                  {l.isReversal ? <span className="text-n600 text-[10px] uppercase tracking-wide border border-n200 rounded px-1">Reversal</span> : null}
                  {l.isReversed ? <span className="text-n600 text-[10px] uppercase tracking-wide border border-n200 rounded px-1">Reversed</span> : null}
                </div>
              </div>
              <div className="text-ink text-[15px] font-medium tabular-nums flex-none">{l.quantity}</div>
            </div>
          ))}

          <div className="flex items-center justify-between gap-3 px-5 py-3 bg-n50 border-t border-n200">
            <span className="text-n600 text-xs uppercase tracking-wide">
              {lines.length} item{lines.length === 1 ? "" : "s"}
            </span>
            <span className="text-ink text-[15px] font-medium tabular-nums">{totalQuantity}</span>
          </div>
        </div>

        <p className="text-center text-xs text-n400 mt-4">Receipt is computer generated.</p>
      </div>
    </div>
  );
}
