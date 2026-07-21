export function Card({
  title,
  extra,
  children,
  className,
}: {
  title?: string;
  extra?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`bg-white border border-n200 rounded ${className ?? ""}`}>
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
