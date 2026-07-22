"use client";

import { memo } from "react";

// Memoized deliberately: with 150 products on the list, the parent's state
// array is replaced on every keystroke, but since every prop here is a
// primitive (not the parent's line object), React.memo's shallow comparison
// bails out any row whose own value/disabled didn't change — no
// virtualisation library needed to keep this fast on a mid-range phone. The
// single `onChange` reference is created once by the parent (useCallback,
// empty deps) and never changes, so it never defeats the memoization.
export const CountRow = memo(function CountRow({
  productId,
  code,
  name,
  shelfOrder,
  value,
  disabled,
  onChange,
}: {
  productId: string;
  code: string;
  name: string;
  shelfOrder: number | null;
  value: string;
  disabled: boolean;
  onChange: (productId: string, value: string) => void;
}) {
  const filled = value.trim() !== "";
  return (
    <div className="flex items-center gap-3 px-4 py-2.5 border-b border-n200 last:border-b-0">
      <div className="min-w-0 flex-1">
        <div className="text-sm truncate">{name}</div>
        <div className="text-xs text-n400 tabular-nums truncate">
          {code}
          {shelfOrder != null ? ` · Shelf ${shelfOrder}` : ""}
        </div>
      </div>
      <input
        type="number"
        inputMode="numeric"
        min={0}
        disabled={disabled}
        value={value}
        onChange={(e) => onChange(productId, e.target.value)}
        placeholder="—"
        className={`w-20 h-12 flex-none text-center text-[17px] tabular-nums rounded border ${
          filled ? "border-teal bg-[#F0FAF8] text-teal font-medium" : "border-n200 bg-white"
        } focus:outline-2 focus:outline-teal focus:-outline-offset-1 disabled:bg-n50 disabled:text-n600 disabled:border-n200`}
      />
    </div>
  );
});
