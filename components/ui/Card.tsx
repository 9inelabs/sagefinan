export function Card({
  title,
  extra,
  children,
  className,
  variant = "premium",
}: {
  title?: string;
  extra?: string;
  children: React.ReactNode;
  className?: string;
  // "premium" (larger radius, soft shadow, no hairline border) is the
  // default surface everywhere now that the redesign has rolled out past
  // the Dashboard preview — "default" (the original flat/hairline-border
  // look) is kept only for anything that still needs it explicitly. See
  // CLAUDE.md's follow-up on the premium redesign.
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
