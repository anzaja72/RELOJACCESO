"use client";

import { useEffect, useState } from "react";
import { stores } from "@/lib/api-client";

/** Permisos del usuario actual según la matriz (vacío si no hay sesión). */
export function usePermissions() {
  const [state, setState] = useState<{ role: string | null; permissions: Set<string>; ready: boolean }>({
    role: null,
    permissions: new Set(),
    ready: false,
  });
  useEffect(() => {
    void stores
      .permissions()
      .then((r) => setState({ role: r.role, permissions: new Set(r.permissions), ready: true }))
      .catch(() => setState({ role: null, permissions: new Set(), ready: true }));
  }, []);
  return { ...state, can: (p: string) => state.permissions.has(p) };
}
