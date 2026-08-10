"use client";

import { useEffect } from "react";

export function ServiceWorkerRegister() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    void navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {
      // Connectivity banner + IndexedDB outbox still operate if SW registration is unavailable.
    });
  }, []);
  return null;
}
