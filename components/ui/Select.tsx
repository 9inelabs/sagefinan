import type { SelectHTMLAttributes } from "react";

export function Select({ className, children, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={`px-[11px] py-[7px] border border-n200 rounded text-[12.5px] bg-white text-ink focus:outline-2 focus:outline-brand-bright focus:-outline-offset-1 focus:border-brand-bright disabled:bg-n50 disabled:text-n600 ${className ?? ""}`}
      {...props}
    >
      {children}
    </select>
  );
}
