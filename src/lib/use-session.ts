"use client";

import { useSyncExternalStore } from "react";
import { getSessionUser } from "@/lib/client-session";

function subscribe(cb: () => void) {
  window.addEventListener("storage", cb);
  return () => window.removeEventListener("storage", cb);
}

/** Perfil de la sesión (null en el servidor y sin sesión), sin parpadeos de hidratación. */
export function useSessionRole() {
  return useSyncExternalStore(
    subscribe,
    () => getSessionUser()?.role ?? null,
    () => null,
  );
}
