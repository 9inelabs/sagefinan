// Shared building blocks for route-level loading.tsx files. Kept dependency-free
// (plain CSS animation, no client JS) — see the "Loading & navigation feedback"
// section of CLAUDE.md for how these compose per screen.

export function SkeletonBlock({ className = "" }: { className?: string }) {
  return <div className={`bg-n100 rounded animate-pulse ${className}`} />;
}

// Wraps a loading.tsx's content so it fades in only after a short delay —
// avoids a flash of skeleton on navigations that resolve in well under 100ms.
export function SkeletonIn({ children }: { children: React.ReactNode }) {
  return <div className="skeleton-in">{children}</div>;
}

// Mirrors PageShell's header chrome (title/subtitle block + optional action
// buttons) so swapping from skeleton to real content never shifts layout.
export function SkeletonPageHeader({ actions = 0 }: { actions?: number }) {
  return (
    <header className="bg-white border-b border-n200 px-4 min-[900px]:px-6 py-3 sticky top-0 z-10 flex items-center justify-between gap-4">
      <div className="min-w-0">
        <SkeletonBlock className="h-5 w-36" />
        <SkeletonBlock className="h-3 w-56 mt-2.5" />
      </div>
      {actions > 0 ? (
        <div className="flex items-center gap-2 flex-none">
          {Array.from({ length: actions }).map((_, i) => (
            <SkeletonBlock key={i} className="h-8 w-24" />
          ))}
        </div>
      ) : null}
    </header>
  );
}

// The scrollable body area PageShell wraps children in — same padding/max-width.
export function SkeletonPageBody({ children }: { children: React.ReactNode }) {
  return <div className="px-4 min-[900px]:px-6 py-5.5 pb-10 max-w-[1180px] w-full">{children}</div>;
}

// Full-page skeleton: header chrome + body, faded in after a short delay.
export function SkeletonPage({ actions = 0, children }: { actions?: number; children: React.ReactNode }) {
  return (
    <SkeletonIn>
      <SkeletonPageHeader actions={actions} />
      <SkeletonPageBody>{children}</SkeletonPageBody>
    </SkeletonIn>
  );
}

export function SkeletonStatRow({ count = 4 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 min-[900px]:grid-cols-4 gap-3 mb-4.5">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="bg-white border border-n200 rounded px-[15px] py-[13px]">
          <SkeletonBlock className="h-3 w-20 mb-2.5" />
          <SkeletonBlock className="h-6 w-16" />
        </div>
      ))}
    </div>
  );
}

// Mirrors the app's standard <Card><table> shape used across every list screen.
export function SkeletonTable({
  title,
  columns = 6,
  rows = 8,
}: {
  title?: boolean;
  columns?: number;
  rows?: number;
}) {
  return (
    <div className="bg-white border border-n200 rounded overflow-hidden">
      {title ? (
        <div className="px-4 py-3 border-b border-n200">
          <SkeletonBlock className="h-4 w-32" />
        </div>
      ) : null}
      <div className="border-b border-n200 bg-n50 flex items-center px-4 h-8 gap-4">
        {Array.from({ length: columns }).map((_, i) => (
          <SkeletonBlock key={i} className="h-2.5 flex-1" />
        ))}
      </div>
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className="border-b border-n200 last:border-b-0 flex items-center px-4 h-9 gap-4">
          {Array.from({ length: columns }).map((_, c) => (
            <SkeletonBlock key={c} className="h-3 flex-1" />
          ))}
        </div>
      ))}
    </div>
  );
}

// A single shelf-order-style row (Take stock / Opening balances) — narrower
// than a full data table, one label + one input-shaped block per row.
export function SkeletonListRows({ rows = 10 }: { rows?: number }) {
  return (
    <div className="bg-white border border-n200 rounded overflow-hidden">
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className="border-b border-n200 last:border-b-0 flex items-center justify-between px-4 h-12 gap-4">
          <SkeletonBlock className="h-3 w-40" />
          <SkeletonBlock className="h-8 w-16" />
        </div>
      ))}
    </div>
  );
}

// A Card-shaped form skeleton for create/edit screens and batch-entry pages.
export function SkeletonFormCard({ rows = 4 }: { rows?: number }) {
  return (
    <div className="bg-white border border-n200 rounded overflow-hidden">
      <div className="px-4 py-3 border-b border-n200">
        <SkeletonBlock className="h-4 w-28" />
      </div>
      <div className="p-4 flex flex-col gap-4">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i}>
            <SkeletonBlock className="h-2.5 w-20 mb-2" />
            <SkeletonBlock className="h-9 w-full max-w-sm" />
          </div>
        ))}
      </div>
    </div>
  );
}

// For lighter screens where a table/form skeleton would overclaim structure —
// a plain centred indicator, per CLAUDE.md's "restrained, not attention-grabbing" rule.
export function SkeletonSpinner() {
  return (
    <div className="flex items-center justify-center py-20">
      <div className="w-6 h-6 rounded-full border-2 border-n200 border-t-teal animate-spin" aria-label="Loading" />
    </div>
  );
}
