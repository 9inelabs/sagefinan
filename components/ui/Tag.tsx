// Soft, borderless status pills — tinted background + matching text colour.
const VARIANTS = {
  ok: "text-green bg-green-soft",
  bad: "text-red bg-red-soft",
  warn: "text-amber bg-amber-soft",
  mut: "text-n600 bg-n100",
  acc: "text-brand bg-brand-soft",
} as const;

export function Tag({ variant, children }: { variant: keyof typeof VARIANTS; children: React.ReactNode }) {
  return (
    <span className={`inline-block text-[11px] font-medium px-2 py-[3px] rounded-sm leading-normal whitespace-nowrap ${VARIANTS[variant]}`}>
      {children}
    </span>
  );
}
