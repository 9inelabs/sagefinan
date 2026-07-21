"use client";

import { createContext, useContext } from "react";

export const DrawerContext = createContext<{ open: () => void }>({ open: () => {} });

export function useDrawer() {
  return useContext(DrawerContext);
}
