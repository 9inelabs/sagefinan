"use client";

import { useEffect } from "react";

// Dev-mode assets (CSS/JS) change on every save; a cache-first service
// worker serving them causes exactly the kind of "styles silently stopped
// applying" breakage this route hit — the browser keeps serving whatever it
// cached on first load regardless of what next dev recompiles afterward.
// Register only in production, and actively tear down anything a dev-mode
// session may have already installed so an already-affected browser recovers
// on its next load instead of staying stuck.
export function RegisterServiceWorker() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    if (process.env.NODE_ENV !== "production") {
      navigator.serviceWorker.getRegistrations().then((registrations) => {
        registrations.forEach((registration) => registration.unregister());
      });
      if ("caches" in window) {
        caches.keys().then((keys) => keys.forEach((key) => caches.delete(key)));
      }
      return;
    }

    navigator.serviceWorker.register("/sw.js").catch(() => {
      // Installability/caching is a progressive enhancement — the app
      // still requires a live connection to function either way.
    });
  }, []);

  return null;
}
