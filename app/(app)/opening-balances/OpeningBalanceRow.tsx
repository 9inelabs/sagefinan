"use client";

import { memo } from "react";

// Mirrors count/[id]/CountRow.tsx's shelf-ordered input pattern (44px+
// touch target, filled vs. empty visually distinct) — this screen is the
// same "walk the shelf, type numbers" shape, just for opening stock instead
// of a physical count.
export const OpeningBalanceRow = memo(function OpeningBalanceRow({
  productId,
  code,
  name,
  shelfOrder,
  value,
  isSet,
  onChange,
}: {
  productId: string;
  code: string;
  name: string;
  shelfOrder: number | null;
  value: string;
  isSet: boolean;
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
          {!isSet ? <span className="text-amber"> · Not set</span> : null}
        </div>
      </div>
      <input
        type="number"
        inputMode="numeric"
        min={0}
        value={value}
        onChange={(e) => onChange(productId, e.target.value)}
        placeholder="0"
        className={`w-20 h-12 flex-none text-center text-[17px] tabular-nums rounded border ${
          filled ? "border-teal bg-[#F0FAF8] text-teal font-medium" : "border-n200 bg-white"
        } focus:outline-2 focus:outline-teal focus:-outline-offset-1`}
      />
    </div>
  );
});
