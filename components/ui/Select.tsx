import type { SelectHTMLAttributes } from "react";

export function Select({ className, children, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={`px-[11px] py-[7px] border border-n200 rounded text-sm bg-white text-ink focus:outline-2 focus:outline-teal focus:-outline-offset-1 focus:border-teal disabled:bg-n50 disabled:text-n600 ${className ?? ""}`}
      {...props}
    >
      {children}
    </select>
  );
}
