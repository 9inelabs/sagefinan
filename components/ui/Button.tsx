import type { ButtonHTMLAttributes } from "react";

const VARIANTS = {
  default: "bg-white border-n200 hover:bg-n50 hover:border-n400 text-ink",
  pri: "bg-ink border-ink text-white hover:bg-black",
  acc: "bg-teal border-teal text-white hover:brightness-95",
} as const;

export function Btn({
  variant = "default",
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: keyof typeof VARIANTS }) {
  return (
    <button
      className={`px-[13px] py-[7px] rounded border text-sm font-normal ${VARIANTS[variant]} ${className ?? ""}`}
      {...props}
    />
  );
}
