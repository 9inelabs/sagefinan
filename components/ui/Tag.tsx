const VARIANTS = {
  ok: "text-green border-[#A7E0BE] bg-[#F0FDF4]",
  bad: "text-red border-[#F3B9B4] bg-[#FEF3F2]",
  warn: "text-amber border-[#F5CFA0] bg-[#FFFAEB]",
  mut: "text-n600 border-n200 bg-n50",
  acc: "text-teal border-[#8FCFC7] bg-[#F0FAF8]",
} as const;

export function Tag({ variant, children }: { variant: keyof typeof VARIANTS; children: React.ReactNode }) {
  return (
    <span className={`inline-block text-[11.5px] px-[7px] py-0.5 rounded border leading-normal ${VARIANTS[variant]}`}>
      {children}
    </span>
  );
}
