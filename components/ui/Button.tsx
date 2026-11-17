import type { ButtonHTMLAttributes } from "react";

// "acc" is the page's primary action (Start count, Post batch, Save) — the
// dark ink pill from the redesign; "pri" is the same weight, used for
// destructive confirmations; "default" is the quiet white secondary button.
const VARIANTS = {
  default: "bg-white border-n200 hover:bg-n50 hover:border-n400 text-ink",
  pri: "bg-ink border-ink text-white hover:bg-frame shadow-btn",
  acc: "bg-ink border-ink text-white hover:bg-frame shadow-btn",
} as const;

export function Btn({
  variant = "default",
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: keyof typeof VARIANTS }) {
  return (
    <button
      className={`inline-flex items-center justify-center gap-1.5 px-3.5 py-[7px] rounded border text-[12.5px] font-medium disabled:opacity-50 disabled:cursor-not-allowed transition-colors ${VARIANTS[variant]} ${className ?? ""}`}
      {...props}
    />
  );
}
