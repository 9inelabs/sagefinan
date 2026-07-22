"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type EntryLine = {
  productId: string;
  code: string;
  name: string;
  shelfOrder: number | null;
  value: string; // "" means blank/null — never coerced to "0"
};

// Shared autosave behaviour behind both the physical-count and ledger-record
// tabs: debounced, per-product-dirty-tracked, never drops a keystroke to a
// slow response (a save in flight doesn't block further typing, and only the
// product ids it actually captured are cleared from the dirty set once it
// resolves — anything edited again meanwhile stays queued for the next
// flush). `save` is the caller's server action, already bound to the right
// column (physical_qty vs ledger_qty).
export function useLineEntries(initialLines: EntryLine[], save: (entries: { productId: string; value: number | null }[]) => Promise<{ savedAt: string }>) {
  const [lines, setLines] = useState<EntryLine[]>(initialLines);
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const linesRef = useRef(lines);
  useEffect(() => {
    linesRef.current = lines;
  }, [lines]);

  const dirtyRef = useRef<Set<string>>(new Set());
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flush = useCallback(async () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    const ids = Array.from(dirtyRef.current);
    if (ids.length === 0) return;
    setSaving(true);
    setSaveError(null);
    const byId = new Map(linesRef.current.map((l) => [l.productId, l]));
    const entries = ids
      .map((id) => byId.get(id))
      .filter((l): l is EntryLine => l != null)
      .map((l) => ({ productId: l.productId, value: l.value.trim() === "" ? null : Number(l.value) }));
    try {
      const { savedAt } = await save(entries);
      ids.forEach((id) => dirtyRef.current.delete(id));
      setLastSavedAt(savedAt);
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "Could not save — will retry.");
    } finally {
      setSaving(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleChange = useCallback(
    (productId: string, value: string) => {
      setLines((prev) => prev.map((l) => (l.productId === productId ? { ...l, value } : l)));
      dirtyRef.current.add(productId);
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(flush, 700);
    },
    [flush]
  );

  const setAll = useCallback((updater: (l: EntryLine) => EntryLine) => {
    setLines((prev) =>
      prev.map((l) => {
        const next = updater(l);
        if (next.value !== l.value) dirtyRef.current.add(l.productId);
        return next;
      })
    );
  }, []);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  return { lines, setLines, handleChange, flush, setAll, lastSavedAt, saving, saveError };
}
