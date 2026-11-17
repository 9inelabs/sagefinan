// Gradient ring spinner — see `.spinner` in app/globals.css.
export function Spinner({ size = 18, ring, className, label }: { size?: number; ring?: number; className?: string; label?: string }) {
  return (
    <span
      role={label ? "status" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      className={`spinner inline-block ${className ?? ""}`}
      style={{ ["--spinner-size" as string]: `${size}px`, ["--spinner-ring" as string]: `${ring ?? Math.max(2, size / 7)}px` }}
    />
  );
}

// Floating glass "Loading…" pill. Without `visible` it only shows while a
// navigation is in flight (html.nprogress-busy); `visible` forces it on,
// for route loading.tsx skeletons.
export function LoadingPill({ visible = false }: { visible?: boolean }) {
  return (
    <div className="loading-pill" data-visible={visible ? "" : undefined} aria-hidden={!visible}>
      <div className="flex items-center gap-2 pl-2 pr-3.5 py-1.5 rounded-full bg-frame/90 text-on-dark text-[12px] font-medium shadow-lift ring-1 ring-white/10 backdrop-blur-md">
        <Spinner size={18} />
        Loading…
      </div>
    </div>
  );
}

// Centred spinner for a block that is still fetching its data.
export function LoadingBlock({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2.5 py-14 text-[12px] text-n600" role="status">
      <Spinner size={28} />
      {label}
    </div>
  );
}
