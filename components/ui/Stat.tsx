import type { LucideIcon } from "lucide-react";

export type StatBar = { value: number; tone: "brand" | "brand-dim" | "red" | "empty" };

const BAR_TONE: Record<StatBar["tone"], string> = {
  brand: "bg-brand-bright",
  "brand-dim": "bg-brand",
  red: "bg-red/85",
  empty: "bg-n200",
};

// Stat tile. "premium" is the white default; "hero" is the dark, slightly
// tilted lead tile on the dashboard. Optional `bars` draws a tiny per-item
// bar strip in the corner (each bar's height is its value relative to the
// largest), `icon` a tinted icon chip, and `footer` a line under the figure.
export function Stat({
  label,
  value,
  hint,
  colorClassName,
  footer,
  bars,
  icon: Icon,
  iconTone = "brand",
  variant = "premium",
}: {
  label: string;
  value: string;
  hint?: string;
  colorClassName?: string;
  footer?: React.ReactNode;
  bars?: StatBar[];
  icon?: LucideIcon;
  iconTone?: "brand" | "amber";
  variant?: "default" | "premium" | "hero";
}) {
  const hero = variant === "hero";
  const surface =
    variant === "hero"
      ? "surface-hero rounded-premium min-[900px]:-rotate-1"
      : variant === "premium"
        ? "bg-white rounded-premium shadow-premium"
        : "bg-white border border-n200 rounded";
  const max = Math.max(1, ...(bars ?? []).map((b) => Math.abs(b.value)));

  return (
    <div className={`${surface} relative px-4 py-3.5 h-full ${footer || bars?.length || Icon ? "min-h-[104px]" : ""}`}>
      <span className={`block text-[11.5px] pr-10 ${hero ? "text-on-dark-mut" : "text-n600"}`}>{label}</span>
      <b className={`block text-[22px] font-medium mt-1.5 tracking-[-0.025em] leading-tight tabular-nums ${colorClassName ?? (hero ? "text-on-dark" : "text-ink")}`}>
        {value}
        {hint ? <i className={`not-italic text-xs font-normal tracking-normal ml-1 ${hero ? "text-on-dark-mut" : "text-n600"}`}>{hint}</i> : null}
      </b>
      {footer ? <div className={`text-[11px] mt-2 ${hero ? "text-on-dark-mut" : "text-n600"}`}>{footer}</div> : null}

      {bars && bars.length > 0 ? (
        <div className="absolute right-3.5 bottom-3.5 h-9 flex items-end gap-1" aria-hidden>
          {bars.map((b, i) => (
            <i
              key={i}
              className={`block w-1.5 rounded-[2px] ${b.tone === "empty" && hero ? "bg-frame-3" : BAR_TONE[b.tone]}`}
              style={{ height: `${b.value === 0 ? 12 : Math.max(16, (Math.abs(b.value) / max) * 100)}%` }}
            />
          ))}
        </div>
      ) : null}

      {Icon ? (
        <div
          className={`absolute right-3.5 top-3.5 w-8 h-8 rounded grid place-items-center ${
            iconTone === "amber" ? "bg-amber-soft text-amber" : "bg-brand-soft text-brand"
          }`}
          aria-hidden
        >
          <Icon size={16} strokeWidth={1.75} />
        </div>
      ) : null}
    </div>
  );
}
