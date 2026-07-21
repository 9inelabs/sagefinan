"use client";

import { useEffect } from "react";

export function RegisterServiceWorker() {
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        // Installability/caching is a progressive enhancement — the app
        // still requires a live connection to function either way.
      });
    }
  }, []);

  return null;
}
