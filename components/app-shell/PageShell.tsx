"use client";

import { useDrawer } from "./drawer-context";

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
  const { open } = useDrawer();

  return (
    <>
      <header className="bg-white border-b border-n200 px-4 min-[900px]:px-6 py-3 sticky top-0 z-10 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <button
            type="button"
            onClick={open}
            aria-label="Open menu"
            className="min-[900px]:hidden w-12 h-12 -ml-2 grid place-items-center flex-none"
          >
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6">
              <path d="M2 5h16M2 10h16M2 15h16" strokeLinecap="round" />
            </svg>
          </button>
          <div className="min-w-0">
            <h1 className="text-xl font-medium tracking-tight text-ink truncate">{title}</h1>
            {subtitle ? <p className="text-xs text-n600 mt-0.5 truncate">{subtitle}</p> : null}
          </div>
        </div>
        {actions ? <div className="flex items-center gap-2 flex-none">{actions}</div> : null}
      </header>
      <div className="px-4 min-[900px]:px-6 py-5.5 pb-10 max-w-[1180px] w-full">{children}</div>
    </>
  );
}
