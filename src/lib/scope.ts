import { NextResponse } from "next/server";
import { requireActor, requireWrite, type Actor } from "@/lib/auth";
import { getEmployee, getSiteByCode } from "@/lib/db";
import { siteIdsForScope } from "@/lib/db-ops";
import { json } from "@/lib/http";
import { canApprove } from "@/lib/session";
import type { Employee } from "@/lib/types";

// Alcance por sede y región. `siteIdsForScope` devuelve null para quien ve todo
// (superadmin, auditor, alcance "all") y la lista de sedes permitidas para el resto.

/** null = todas las sedes; si no, ids de sede permitidos. */
export function allowedSiteIds(actor: Actor): string[] | null {
  return siteIdsForScope({ role: actor.role, scopeType: actor.scopeType, scopeId: actor.scopeId });
}

/** `site` puede venir como id o como código (R01). */
export function siteInScope(actor: Actor, site: string | null | undefined): boolean {
  const allowed = allowedSiteIds(actor);
  if (!allowed) return true;
  if (!site) return false;
  const id = getSiteByCode(site)?.id ?? site;
  return allowed.includes(id);
}

export function filterBySite<T>(actor: Actor, rows: T[], siteOf: (row: T) => string | null | undefined): T[] {
  const allowed = allowedSiteIds(actor);
  return allowed ? rows.filter((r) => allowed.includes(String(siteOf(r)))) : rows;
}

/** Datos de gestión: gerentes de sede o superior, y auditor (lectura). El operador no. */
export function requireReader(request: Request): Actor | NextResponse {
  const actor = requireActor(request);
  if (actor instanceof NextResponse) return actor;
  if (!canApprove(actor.role) && actor.role !== "auditor") {
    return json({ error: "Se requiere gerente de sede, auditor o superior", code: "FORBIDDEN" }, 403, request);
  }
  return actor;
}

/** Solo el superadmin (ajustes globales). */
export function requireSuperadmin(request: Request): Actor | NextResponse {
  const actor = requireActor(request);
  if (actor instanceof NextResponse) return actor;
  if (actor.role !== "superadmin") {
    return json({ error: "Solo el superadmin", code: "FORBIDDEN" }, 403, request);
  }
  return actor;
}

/**
 * Un empleado al que el usuario tiene acceso. `write` exige permiso de escritura
 * (el auditor no lo tiene); fuera de su alcance se responde 404, como si no existiera.
 */
export function requireEmployeeAccess(
  request: Request,
  employeeId: string,
  opts: { write: boolean },
): { actor: Actor; employee: Employee } | NextResponse {
  const actor = opts.write ? requireWrite(request) : requireActor(request);
  if (actor instanceof NextResponse) return actor;
  const employee = getEmployee(employeeId);
  if (!employee || !siteInScope(actor, employee.siteId)) {
    return json({ error: "No encontrado", code: "NOT_FOUND" }, 404, request);
  }
  return { actor, employee };
}
