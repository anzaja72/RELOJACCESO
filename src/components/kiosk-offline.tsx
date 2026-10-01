"use client";

import { useEffect } from "react";

// Registra el service worker del kiosco y le pasa los assets que esta página ya
// cargó, para que el kiosco abra sin internet incluso tras reiniciar la tablet.
export function KioskOffline() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    // Pide al navegador que no borre IndexedDB (cola de marcas y plantillas) por falta de espacio.
    void navigator.storage?.persist?.().catch(() => undefined);
    void navigator.serviceWorker
      .register("/sw.js", { scope: "/kiosk" })
      .then(() => navigator.serviceWorker.ready)
      .then((reg) => {
        const urls = [
          ...performance.getEntriesByType("resource").map((e) => new URL(e.name).pathname),
          ...[...document.querySelectorAll<HTMLElement>("script[src], link[href]")].map((el) =>
            new URL(el.getAttribute("src") ?? el.getAttribute("href") ?? "", location.href).pathname,
          ),
        ];
        reg.active?.postMessage({ type: "warm", urls: [...new Set(urls)] });
      })
      .catch(() => undefined);
  }, []);
  return null;
}
