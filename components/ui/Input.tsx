import type { InputHTMLAttributes } from "react";

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={`w-full px-[11px] py-[7px] border border-n200 rounded text-[12.5px] text-ink placeholder:text-n400 bg-white focus:outline-2 focus:outline-brand-bright focus:-outline-offset-1 focus:border-brand-bright disabled:bg-n50 disabled:text-n600 ${className ?? ""}`}
      {...props}
    />
  );
}
