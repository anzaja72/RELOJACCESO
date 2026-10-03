import type { SessionUser } from "@/lib/session";
import type { Site } from "@/lib/types";

export const ROLE_LABEL: Record<SessionUser["role"], string> = {
  superadmin: "Superadmin",
  zone_manager: "Gerente de zona",
  site_manager: "Gerente de sede",
  operator: "Operador",
  auditor: "Auditor",
};

export type ZoneRow = { id: string; name: string; country_id: string };
export type CountryRow = { id: string; name: string };

/** Frase corta con lo que el usuario puede ver: "Región Andina · 1 sede". */
export function scopeLabel(user: SessionUser, sites: Site[], zones: ZoneRow[]) {
  const count = `${sites.length} ${sites.length === 1 ? "sede" : "sedes"}`;
  if (user.scopeType === "zone") {
    return `${zones.find((z) => z.id === user.scopeId)?.name ?? "Región"} · ${count}`;
  }
  if (user.scopeType === "site") return sites[0]?.name ?? "Su sede";
  return `Todas las sedes (${sites.length})`;
}
