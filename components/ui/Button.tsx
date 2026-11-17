import type { ButtonHTMLAttributes } from "react";
import { Spinner } from "./Spinner";

// "acc" is the page's primary action (Start count, Post batch, Save) — the
// dark ink pill from the redesign; "pri" is the same weight, used for
// destructive confirmations; "default" is the quiet white secondary button.
const VARIANTS = {
  default: "bg-white border-n200 hover:bg-brand-hover hover:border-brand/30 text-ink",
  pri: "bg-ink border-ink text-white hover:bg-frame shadow-btn",
  acc: "bg-ink border-ink text-white hover:bg-frame shadow-btn",
} as const;

// A button shows the gradient spinner while it is working: either when
// `loading` is set, or — so every existing "Saving…"/"Posting…" pending
// label gets one without per-screen changes — whenever its label is a plain
// string ending in an ellipsis.
export function Btn({
  variant = "default",
  loading,
  className,
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: keyof typeof VARIANTS; loading?: boolean }) {
  const busy = loading ?? (typeof children === "string" && children.endsWith("…"));
  return (
    <button
      aria-busy={busy || undefined}
      className={`inline-flex items-center justify-center gap-1.5 px-3.5 py-[7px] rounded border text-[12.5px] font-medium disabled:cursor-not-allowed transition-[background-color,border-color,transform,opacity] duration-200 active:scale-[0.98] ${
        busy ? "" : "disabled:opacity-50"
      } ${VARIANTS[variant]} ${className ?? ""}`}
      {...props}
    >
      {busy ? <Spinner size={14} /> : null}
      {children}
    </button>
  );
}
