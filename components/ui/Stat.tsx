export function Stat({
  label,
  value,
  hint,
  colorClassName,
}: {
  label: string;
  value: string;
  hint?: string;
  colorClassName?: string;
}) {
  return (
    <div className="bg-white border border-n200 rounded px-[15px] py-[13px]">
      <span className="text-[11.5px] text-n600 tracking-wide uppercase">{label}</span>
      <b className={`block text-2xl font-medium mt-[5px] tracking-tight tabular-nums ${colorClassName ?? "text-ink"}`}>
        {value}
        {hint ? <i className="not-italic text-xs text-n600 font-normal"> {hint}</i> : null}
      </b>
    </div>
  );
}
