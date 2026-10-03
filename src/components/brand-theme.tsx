"use client";

import { useEffect, useSyncExternalStore } from "react";
import { BRAND_EVENT, BRAND_KEY, applyBrand, parseBrand, type Brand } from "@/lib/brand";

// Pide la marca del servidor al cargar y la aplica. Si no hay red, queda la que
// el script de arranque ya puso desde localStorage.
export function BrandTheme() {
  useEffect(() => {
    void fetch("/api/v1/brand", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { brand: Partial<Brand> | null } | null) => {
        if (data) applyBrand(parseBrand(data.brand));
      })
      .catch(() => undefined);
  }, []);
  return null;
}

function subscribe(cb: () => void) {
  window.addEventListener(BRAND_EVENT, cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener(BRAND_EVENT, cb);
    window.removeEventListener("storage", cb);
  };
}

/** Marca del cliente (null si la app está en versión básica). */
export function useBrand(): Brand | null {
  const raw = useSyncExternalStore(
    subscribe,
    () => document.documentElement.dataset.brandPreview ?? window.localStorage.getItem(BRAND_KEY) ?? "",
    () => "",
  );
  try {
    return parseBrand(raw ? JSON.parse(raw) : null);
  } catch {
    return null;
  }
}
