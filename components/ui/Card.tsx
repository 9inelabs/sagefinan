export function Card({
  title,
  extra,
  children,
  className,
  variant = "default",
}: {
  title?: string;
  extra?: string;
  children: React.ReactNode;
  className?: string;
  // "premium" is the redesign's surface treatment (larger radius, soft
  // shadow, no hairline border) — additive, only used where a screen has
  // actually been migrated (currently just the Dashboard). Every other
  // caller keeps "default" (the original flat/hairline-border look)
  // unchanged. See CLAUDE.md's follow-up on the premium redesign.
  variant?: "default" | "premium";
}) {
  const surface = variant === "premium" ? "bg-white rounded-premium shadow-premium" : "bg-white border border-n200 rounded";
  return (
    <div className={`${surface} ${className ?? ""}`}>
      {title ? (
        <h2 className="text-sm font-medium px-4 py-3 border-b border-n200 flex justify-between items-center gap-2.5">
          {title}
          {extra ? <em className="not-italic text-xs text-n600 font-normal">{extra}</em> : null}
        </h2>
      ) : null}
      {children}
    </div>
  );
}
