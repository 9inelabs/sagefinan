// The redesign's card surface. "premium" (white, 18px radius, soft shadow)
// is the default everywhere; "dark" and "tint" are the two feature surfaces
// the dashboard uses (Movements today, the closing-value summary); "default"
// is the old flat hairline-border look, kept as an explicit escape hatch.
const SURFACES = {
  premium: "bg-white rounded-premium shadow-premium",
  dark: "surface-dark rounded-premium",
  tint: "surface-tint rounded-premium",
  default: "bg-white border border-n200 rounded",
} as const;

export function Card({
  title,
  extra,
  actions,
  children,
  className,
  variant = "premium",
}: {
  title?: string;
  extra?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  variant?: keyof typeof SURFACES;
}) {
  const dark = variant === "dark";
  return (
    <div className={`${SURFACES[variant]} [&>.overflow-x-auto:last-child]:rounded-b-premium ${className ?? ""}`}>
      {title ? (
        <div className="px-4.5 pt-4 pb-2.5 flex justify-between items-start gap-3">
          <div className="min-w-0">
            <h2 className={`text-[14px] font-medium tracking-[-0.01em] ${dark ? "text-on-dark" : "text-ink"}`}>{title}</h2>
            {extra ? <p className={`text-[11.5px] mt-0.5 ${dark ? "text-on-dark-mut" : "text-n600"}`}>{extra}</p> : null}
          </div>
          {actions ? <div className="flex items-center gap-2 flex-none">{actions}</div> : null}
        </div>
      ) : null}
      {children}
    </div>
  );
}
