"use client";

import { useEffect, useRef, useState } from "react";

// Shared by the Purchases/Requisitions/Sales product-search comboboxes —
// all three used to call their server action directly on every keystroke,
// with only a "stale response" guard (no debounce), so typing an 8-letter
// product name fired 6-10 overlapping round trips. This waits `delayMs`
// after the last keystroke before searching at all, and still guards
// against an old, slow response clobbering a newer one.
export function useDebouncedSearch<T>(searchFn: (query: string) => Promise<T[]>, delayMs = 250) {
  const [query, setQueryState] = useState("");
  const [results, setResults] = useState<T[]>([]);
  const [searching, setSearching] = useState(false);
  const tokenRef = useRef(0);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchFnRef = useRef(searchFn);
  searchFnRef.current = searchFn;

  useEffect(
    () => () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    },
    []
  );

  function handleChange(q: string) {
    setQueryState(q);
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    tokenRef.current++; // invalidate anything already in flight
    if (!q.trim()) {
      setResults([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    const token = tokenRef.current;
    timeoutRef.current = setTimeout(async () => {
      try {
        const data = await searchFnRef.current(q);
        if (token === tokenRef.current) {
          setResults(data);
          setSearching(false);
        }
      } catch {
        if (token === tokenRef.current) setSearching(false);
      }
    }, delayMs);
  }

  // Sets the visible input text without scheduling a new search — used when
  // picking a suggestion, where the input is filled with "CODE — Name" and
  // that shouldn't itself trigger a fresh lookup.
  function setDisplayText(text: string) {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    tokenRef.current++;
    setQueryState(text);
    setSearching(false);
  }

  function reset() {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    tokenRef.current++;
    setQueryState("");
    setResults([]);
    setSearching(false);
  }

  return { query, results, searching, handleChange, setDisplayText, setResults, reset };
}
