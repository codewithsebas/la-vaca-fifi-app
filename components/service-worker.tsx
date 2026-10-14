"use client";

import { useEffect } from "react";

// Registra public/sw.js (página sin conexión de la PWA). Solo en producción: en desarrollo no interfiere con la recarga en caliente.
export function ServiceWorker() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" }).catch(() => {});
  }, []);
  return null;
}
