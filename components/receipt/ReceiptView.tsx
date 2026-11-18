import Link from "next/link";
import { ArrowLeft, Download } from "lucide-react";
import { formatNaira } from "@/lib/format";
import { formatDateTime, formatWeekdayDate } from "@/lib/dates";
import type { ReceiptData } from "@/lib/receipts/actions";
import { PrintButton } from "./PrintButton";

function signedQty(n: number) {
  return n < 0 ? `−${Math.abs(n)}` : String(n);
}
function money(n: number | null) {
  if (n == null) return "—";
  return n < 0 ? `−${formatNaira(n)}` : formatNaira(n);
}

// Every transaction receipt (sales, requisitions, purchases, adjustments) in
// the dark-green system: a dark hero header with the hotel, receipt type,
// reference, headline party and grand total, a perforated tear line, then a
// clean itemised table with unit price/value, flags and notes, and a totals
// block. Printable (browser print hides the app chrome — see globals.css)
// and downloadable as a matching PDF (lib/pdf/ReceiptDocument.tsx).
export function ReceiptView({ receipt, backHref, backLabel, pdfHref }: { receipt: ReceiptData; backHref: string; backLabel: string; pdfHref: string }) {
  const pill =
    "inline-flex items-center gap-1.5 h-9.5 px-4 rounded-full text-[12.5px] font-medium transition-[transform,background-color] active:scale-[0.97]";

  return (
    <div className="max-w-[860px] mx-auto w-full">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3" data-print-hide>
        <Link href={backHref} className={`${pill} bg-white shadow-premium text-ink hover:bg-brand-hover`}>
          <ArrowLeft size={15} strokeWidth={1.8} />
          {backLabel}
        </Link>
        <div className="flex gap-2">
          <PrintButton className={`${pill} bg-white shadow-premium text-ink hover:bg-brand-hover`} />
          <a href={pdfHref} className={`${pill} bg-ink text-white shadow-btn hover:bg-frame`}>
            <Download size={15} strokeWidth={1.9} className="text-brand-bright" />
            Download PDF
          </a>
        </div>
      </div>

      <article className="rounded-[22px] overflow-hidden bg-white shadow-premium animate-rise [print-color-adjust:exact] [-webkit-print-color-adjust:exact]">
        <header className="surface-hero rounded-none px-6 min-[700px]:px-8 pt-6 pb-7">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-2.5">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/logo-mark.png" alt="" className="w-7 h-auto invert" />
              <div>
                <p className="text-[14px] font-medium tracking-[-0.01em]">De-Moon Hotel</p>
                <p className="text-[10.5px] text-on-dark-mut">Stock Database</p>
              </div>
            </div>
            <div className="text-right">
              <span className="inline-block text-[10.5px] tracking-[0.12em] uppercase px-2.5 py-1 rounded-full bg-brand-bright/15 text-brand-bright ring-1 ring-inset ring-brand-bright/25">
                {receipt.title}
              </span>
              <p className="text-[11px] text-on-dark-mut mt-1.5 tabular-nums">{receipt.reference}</p>
            </div>
          </div>

          <div className="mt-6 flex flex-wrap items-end justify-between gap-4">
            <div className="min-w-0">
              <p className="text-[11.5px] text-on-dark-mut">{receipt.kind === "PURCHASE" ? "Supplier" : "Department"}</p>
              <h2 className="text-[24px] min-[700px]:text-[28px] font-medium tracking-[-0.03em] leading-tight truncate">{receipt.headline}</h2>
              <p className="text-[12px] text-on-dark-2 mt-1">Business day {formatWeekdayDate(receipt.businessDay)}</p>
            </div>
            <div className="text-right">
              <p className="text-[11.5px] text-on-dark-mut">{receipt.valueLabel}</p>
              <p className="text-[28px] min-[700px]:text-[34px] font-normal tracking-[-0.035em] tabular-nums leading-none mt-1">
                {money(receipt.totals.amount)}
              </p>
              <p className="text-[11.5px] text-on-dark-2 mt-1.5 tabular-nums">
                {receipt.totals.items} item{receipt.totals.items === 1 ? "" : "s"} · {signedQty(receipt.totals.quantity)} bottles
              </p>
            </div>
          </div>

          <dl className="mt-6 grid grid-cols-2 min-[700px]:grid-cols-4 gap-2">
            {[...receipt.details, { label: "Recorded", value: formatDateTime(receipt.recordedAt) }].map((d) => (
              <div key={d.label} className="rounded-[12px] bg-white/[0.05] ring-1 ring-inset ring-white/[0.08] px-3 py-2 min-w-0">
                <dt className="text-[10.5px] text-on-dark-mut">{d.label}</dt>
                <dd className="text-[12.5px] text-on-dark truncate">
                  {d.href ? (
                    <Link href={d.href} className="underline decoration-brand-bright/50 underline-offset-2">
                      {d.value}
                    </Link>
                  ) : (
                    d.value
                  )}
                </dd>
              </div>
            ))}
          </dl>
        </header>

        {/* Perforated tear line */}
        <div className="relative h-0" aria-hidden>
          <span className="absolute -left-3 -top-3 w-6 h-6 rounded-full bg-canvas" />
          <span className="absolute -right-3 -top-3 w-6 h-6 rounded-full bg-canvas" />
        </div>
        <div className="mx-6 border-t-2 border-dashed border-n200" aria-hidden />

        <div className="px-3 min-[700px]:px-5 pt-4 pb-2 overflow-x-auto">
          <table className="w-full border-collapse min-w-[520px]">
            <thead>
              <tr className="text-[11px] text-n600">
                <th className="font-normal text-right pr-2 pb-2 w-8">#</th>
                <th className="font-normal text-left px-3 pb-2">Item</th>
                <th className="font-normal text-right px-3 pb-2">Qty</th>
                <th className="font-normal text-right px-3 pb-2">{receipt.kind === "PURCHASE" ? "Unit price" : "Unit cost"}</th>
                <th className="font-normal text-right pl-3 pr-2 pb-2">{receipt.valueLabel}</th>
              </tr>
            </thead>
            <tbody>
              {receipt.lines.map((l, i) => (
                <tr key={l.id} className="border-t border-n100 align-top hover:bg-brand-hover">
                  <td className="text-right pr-2 py-3 text-[11.5px] text-n400 tabular-nums">{i + 1}</td>
                  <td className="px-3 py-3">
                    <p className="text-[13px] text-ink">{l.name}</p>
                    <div className="flex flex-wrap items-center gap-1.5 mt-1">
                      <span className="text-[10.5px] text-n600 tabular-nums bg-n100 rounded-sm px-1.5 py-px">{l.code}</span>
                      {l.flags.map((f) => (
                        <span
                          key={f}
                          className={`text-[10.5px] rounded-sm px-1.5 py-px ${
                            f === "Reversed" || f === "Reversal" ? "bg-red-soft text-red" : f === "Override" ? "bg-amber-soft text-amber" : "bg-brand-soft text-brand"
                          }`}
                        >
                          {f}
                        </span>
                      ))}
                    </div>
                    {l.note ? <p className="text-[11.5px] text-n600 mt-1">“{l.note}”</p> : null}
                  </td>
                  <td className={`px-3 py-3 text-right text-[13px] font-medium tabular-nums ${l.quantity < 0 ? "text-red" : "text-ink"}`}>
                    {signedQty(l.quantity)}
                  </td>
                  <td className="px-3 py-3 text-right text-[12.5px] text-n600 tabular-nums">{l.unitPrice != null ? formatNaira(l.unitPrice) : "—"}</td>
                  <td className={`pl-3 pr-2 py-3 text-right text-[13px] font-medium tabular-nums ${(l.amount ?? 0) < 0 ? "text-red" : "text-ink"}`}>
                    {money(l.amount)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mx-5 min-[700px]:mx-7 mt-2 mb-6 flex justify-end">
          <dl className="w-full max-w-[300px] rounded-[16px] bg-n50 px-4 py-3 text-[12.5px]">
            <div className="flex justify-between py-1">
              <dt className="text-n600">Items</dt>
              <dd className="tabular-nums">{receipt.totals.items}</dd>
            </div>
            <div className="flex justify-between py-1">
              <dt className="text-n600">Total quantity</dt>
              <dd className="tabular-nums">{signedQty(receipt.totals.quantity)}</dd>
            </div>
            <div className="flex justify-between items-end pt-2 mt-1 border-t border-n200">
              <dt className="text-n600">Total {receipt.valueLabel.toLowerCase()}</dt>
              <dd className="text-[18px] font-medium tracking-[-0.02em] tabular-nums text-brand">{money(receipt.totals.amount)}</dd>
            </div>
          </dl>
        </div>

        <footer className="px-6 min-[700px]:px-8 py-4 bg-n50 border-t border-n100 flex flex-wrap justify-between gap-2 text-[10.5px] text-n600">
          <span>Computer-generated receipt · {receipt.reference}</span>
          <span>
            {receipt.kind === "PURCHASE" ? "Amounts are what was paid." : "Values use each product's unit cost."} Entered by {receipt.createdByName}.
          </span>
        </footer>
      </article>
    </div>
  );
}
