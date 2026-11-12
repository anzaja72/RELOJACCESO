import type { Role } from "@/lib/session";

/**
 * Matriz de permisos del documento de requerimientos (sección 3).
 * «Coordinador» se mapea al rol `operator` (alcance de una tienda); sus facultades
 * de planificación y consulta están POR VALIDAR, así que se aplica mínimo privilegio.
 * El empleado no tiene usuario: marca en el kiosco.
 */
export type Permission =
  | "employee.manage"
  | "employee.hr_edit"
  | "employee.salary_view"
  | "types.manage"
  | "access.manage"
  | "mobility.manage"
  | "plan.view"
  | "plan.edit"
  | "plan.submit"
  | "plan.decide"
  | "novelty.view"
  | "novelty.create"
  | "novelty.decide"
  | "hours.view";

const MATRIX: Record<Permission, Role[]> = {
  // Alta, edición, tienda base y baja: solo RR. HH. (sección 3: regional «consulta limitada», gerente «No»).
  "employee.manage": ["superadmin", "hr"],
  "employee.hr_edit": ["superadmin", "hr"],
  "employee.salary_view": ["superadmin", "hr"],
  "types.manage": ["superadmin", "hr"],
  "access.manage": ["superadmin", "zone_manager"],
  "mobility.manage": ["superadmin", "zone_manager"],
  "plan.view": ["superadmin", "hr", "zone_manager", "site_manager", "auditor"],
  "plan.edit": ["superadmin", "zone_manager", "site_manager"],
  "plan.submit": ["superadmin", "zone_manager", "site_manager"],
  "plan.decide": ["superadmin", "zone_manager"],
  "novelty.view": ["superadmin", "hr", "zone_manager", "site_manager", "auditor"],
  "novelty.create": ["superadmin", "hr", "zone_manager", "site_manager"],
  "novelty.decide": ["superadmin", "zone_manager"],
  "hours.view": ["superadmin", "hr", "zone_manager", "site_manager", "auditor"],
};

export function can(role: Role, permission: Permission) {
  return MATRIX[permission].includes(role);
}

export function permissionsOf(role: Role): Permission[] {
  return (Object.keys(MATRIX) as Permission[]).filter((p) => can(role, p));
}
