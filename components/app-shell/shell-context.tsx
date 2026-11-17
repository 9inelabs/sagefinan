"use client";

import { createContext, useContext } from "react";

// Live shell state that page-level client components can read without
// prop-drilling through server components — currently just the unread
// messages count AppShell already keeps live via Realtime (see AppShell.tsx).
export const ShellContext = createContext<{ unreadMessages: number }>({ unreadMessages: 0 });

export function useShell() {
  return useContext(ShellContext);
}
