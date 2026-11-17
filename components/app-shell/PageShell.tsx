// Page title block + body, rendered inside the shell's canvas panel. Not
// sticky — the redesign's header is part of the page, like the reference.
// Actions wrap below the title on narrow screens rather than overflowing.
export function PageShell({
  title,
  subtitle,
  actions,
  children,
}: {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <>
      <header className="px-4 min-[900px]:px-7 pt-5 min-[900px]:pt-6.5 pb-4 min-[900px]:pb-5 flex flex-col min-[700px]:flex-row min-[700px]:items-end justify-between gap-3 min-[700px]:gap-4 w-full">
        <div className="min-w-0">
          <h1 className="text-[22px] min-[900px]:text-[26px] leading-[1.15] font-medium tracking-[-0.025em] text-ink truncate">{title}</h1>
          {subtitle ? <p className="text-xs text-n600 mt-1 truncate">{subtitle}</p> : null}
        </div>
        {actions ? <div className="flex items-center flex-wrap gap-2 min-[700px]:justify-end">{actions}</div> : null}
      </header>
      <div className="px-4 min-[900px]:px-7 pb-10 w-full">{children}</div>
    </>
  );
}
