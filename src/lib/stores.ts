import { ulid } from "ulidx";
import { openJson } from "@/lib/crypto-box";
import {
  getDb,
  getEmployee,
  getSiteByCode,
  listEmployees,
  listPunches,
  listSites,
  recordEvent,
  upsertPunch,
} from "@/lib/db";
import { insertAlert, siteIdsForScope } from "@/lib/db-ops";
import { can, type Permission } from "@/lib/permissions";
import {
  addDays,
  cellMinutes,
  coverageGaps,
  isHm,
  mondayOf,
  totalsByEmployee,
  validateCell,
  weekDates,
  type CellKind,
  type CoverageGap,
  type PlanCell,
} from "@/lib/planning";
import type { SessionUser } from "@/lib/session";
import type { Employee, FaceTemplate, Punch, Site, SyncItem } from "@/lib/types";
import { computeWorkday, localDateTime, type Workday } from "@/lib/workday";

/* ───────────── errores y alcance ───────────── */

export class DomainError extends Error {
  status: 400 | 403 | 404 | 409;
  code: string;
  constructor(message: string, status: 400 | 403 | 404 | 409 = 400, code = "VALIDATION") {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export type StoreActor = Pick<SessionUser, "id" | "email" | "name" | "role" | "scopeType" | "scopeId">;

const SYSTEM = "sistema";
const DATE = /^\d{4}-\d{2}-\d{2}$/;

function scopeOf(actor: StoreActor) {
  return { role: actor.role, scopeType: actor.scopeType, scopeId: actor.scopeId };
}

export function requirePerm(actor: StoreActor, permission: Permission) {
  if (!can(actor.role, permission)) {
    throw new DomainError("Permiso insuficiente para esta acción", 403, "FORBIDDEN");
  }
}

/** Ids de tiendas visibles para el actor; null = todas. */
export function allowedSiteIds(actor: StoreActor): string[] | null {
  return siteIdsForScope(scopeOf(actor));
}

export function inScope(actor: StoreActor, siteId: string) {
  const allowed = allowedSiteIds(actor);
  return allowed === null || allowed.includes(siteId);
}

export function siteOrThrow(siteId: string): Site {
  const site = getSiteByCode(siteId);
  if (!site) throw new DomainError("Tienda no encontrada", 404, "NOT_FOUND");
  return site;
}

/** CP-14: un gerente que pide una tienda ajena recibe acceso denegado. */
export function assertSiteScope(actor: StoreActor, siteId: string): Site {
  const site = siteOrThrow(siteId);
  if (!inScope(actor, site.id)) {
    throw new DomainError("Tienda fuera de su alcance", 403, "FORBIDDEN");
  }
  return site;
}

function employeeOrThrow(id: string): Employee {
  const employee = getEmployee(id);
  if (!employee || employee.deleted) throw new DomainError("Empleado no encontrado", 404, "NOT_FOUND");
  return employee;
}

function assertDate(value: unknown, field: string): string {
  if (typeof value !== "string" || !DATE.test(value)) {
    throw new DomainError(`${field} debe tener formato AAAA-MM-DD`);
  }
  return value;
}

function today(timeZone = "America/Bogota") {
  return localDateTime(new Date().toISOString(), timeZone).date;
}

function audit(type: string, actor: StoreActor | null, payload: Record<string, unknown>) {
  recordEvent(getDb(), type, { ...payload, by: actor?.email ?? SYSTEM, byName: actor?.name ?? SYSTEM });
}

/* ───────────── tipos de empleado / jornada (RF-02) ───────────── */

export type EmployeeType = {
  id: string;
  name: string;
  daysPerWeek: number | null;
  variableDays: boolean;
  weeklyHours: number | null;
  minWeeklyHours: number | null;
  isShiftLead: boolean;
  lunchMin: number;
  validFrom: string | null;
  active: boolean;
  note: string | null;
};

function mapType(row: Record<string, unknown>): EmployeeType {
  return {
    id: String(row.id),
    name: String(row.name),
    daysPerWeek: row.days_per_week == null ? null : Number(row.days_per_week),
    variableDays: Boolean(row.variable_days),
    weeklyHours: row.weekly_hours == null ? null : Number(row.weekly_hours),
    minWeeklyHours: row.min_weekly_hours == null ? null : Number(row.min_weekly_hours),
    isShiftLead: Boolean(row.is_shift_lead),
    lunchMin: Number(row.lunch_min ?? 30),
    validFrom: row.valid_from ? String(row.valid_from) : null,
    active: Boolean(row.active),
    note: row.note ? String(row.note) : null,
  };
}

export function listEmployeeTypes(): EmployeeType[] {
  return (getDb().prepare("SELECT * FROM employee_types ORDER BY name").all() as Record<string, unknown>[]).map(mapType);
}

function typesById() {
  return new Map(listEmployeeTypes().map((t) => [t.id, t]));
}

export function saveEmployeeType(input: Partial<EmployeeType>, actor: StoreActor): EmployeeType {
  requirePerm(actor, "types.manage");
  const name = input.name?.trim();
  if (!name) throw new DomainError("El nombre del tipo es obligatorio");
  const numOrNull = (v: unknown, field: string, max: number) => {
    if (v == null || v === "") return null;
    const n = Number(v);
    if (!Number.isFinite(n) || n < 0 || n > max) throw new DomainError(`${field} fuera de rango`);
    return n;
  };
  const days = numOrNull(input.daysPerWeek, "Días por semana", 7);
  const weekly = numOrNull(input.weeklyHours, "Horas semanales", 84);
  const minWeekly = numOrNull(input.minWeeklyHours, "Mínimo semanal", 84);
  const lunch = numOrNull(input.lunchMin ?? 30, "Almuerzo", 180) ?? 30;
  if (!input.variableDays && days == null) throw new DomainError("Indique días por semana o marque días variables");
  if (weekly == null && minWeekly == null) throw new DomainError("Indique horas semanales o un mínimo semanal");
  const id = input.id || `et_${ulid().toLowerCase()}`;
  const before = getDb().prepare("SELECT * FROM employee_types WHERE id = ?").get(id) as Record<string, unknown> | undefined;
  getDb()
    .prepare(
      `INSERT INTO employee_types (id, name, days_per_week, variable_days, weekly_hours, min_weekly_hours, is_shift_lead, lunch_min, valid_from, active, note, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET name=excluded.name, days_per_week=excluded.days_per_week, variable_days=excluded.variable_days,
         weekly_hours=excluded.weekly_hours, min_weekly_hours=excluded.min_weekly_hours, is_shift_lead=excluded.is_shift_lead,
         lunch_min=excluded.lunch_min, valid_from=excluded.valid_from, active=excluded.active, note=excluded.note, updated_at=excluded.updated_at`,
    )
    .run(
      id,
      name,
      days,
      input.variableDays ? 1 : 0,
      weekly,
      minWeekly,
      input.isShiftLead ? 1 : 0,
      lunch,
      input.validFrom ?? null,
      input.active === false ? 0 : 1,
      input.note ?? null,
      new Date().toISOString(),
    );
  const after = mapType(getDb().prepare("SELECT * FROM employee_types WHERE id = ?").get(id) as Record<string, unknown>);
  audit("employee_type.saved", actor, { id, before: before ? mapType(before) : null, after });
  return after;
}

/* ───────────── ficha de RR. HH. (RF-01) ───────────── */

export const EMPLOYMENT_STATUSES = ["activo", "inactivo", "retirado"] as const;

/** Datos exigidos antes de habilitar la planificación (RF-01). */
export function missingForPlanning(employee: Employee): string[] {
  const missing: string[] = [];
  if (!employee.documentId) missing.push("identificación");
  if (!employee.employeeTypeId) missing.push("tipo de jornada");
  if (!employee.role?.trim()) missing.push("cargo");
  return missing;
}

/** Salario mensual por empleado, leído de `contracts` (nómina); null si el rol no puede verlo. */
function salaryMap(actor: StoreActor): Map<string, number> | null {
  if (!can(actor.role, "employee.salary_view")) return null;
  const rows = getDb().prepare("SELECT employee_id, monthly_salary FROM contracts").all() as Array<{ employee_id: string; monthly_salary: number }>;
  return new Map(rows.map((r) => [r.employee_id, Number(r.monthly_salary)]));
}

/** Ficha laboral de RR. HH. El salario no va aquí: se gestiona en `contracts`. */
export function updateEmployeeHr(
  id: string,
  patch: { documentId?: string | null; employeeTypeId?: string | null; employmentStatus?: string },
  actor: StoreActor,
): Employee {
  requirePerm(actor, "employee.hr_edit");
  const before = employeeOrThrow(id);
  assertSiteScope(actor, before.siteId);
  const db = getDb();
  if (patch.documentId !== undefined) {
    const doc = patch.documentId?.trim() || null;
    if (doc) {
      const clash = db.prepare("SELECT id FROM employees WHERE document_id = ? AND id <> ?").get(doc, id);
      if (clash) throw new DomainError("La identificación ya existe en otro empleado", 409, "DUPLICATE");
    }
    db.prepare("UPDATE employees SET document_id = ? WHERE id = ?").run(doc, id);
  }
  if (patch.employeeTypeId !== undefined) {
    if (patch.employeeTypeId && !typesById().has(patch.employeeTypeId)) throw new DomainError("Tipo de jornada inexistente");
    db.prepare("UPDATE employees SET employee_type_id = ? WHERE id = ?").run(patch.employeeTypeId || null, id);
  }
  if (patch.employmentStatus !== undefined) {
    if (!(EMPLOYMENT_STATUSES as readonly string[]).includes(patch.employmentStatus)) {
      throw new DomainError(`Estado laboral debe ser uno de: ${EMPLOYMENT_STATUSES.join(", ")}`);
    }
    db.prepare("UPDATE employees SET employment_status = ? WHERE id = ?").run(patch.employmentStatus, id);
  }
  const after = employeeOrThrow(id);
  audit("employee.hr_updated", actor, {
    id,
    siteId: after.siteId,
    before: { documentId: before.documentId, employeeTypeId: before.employeeTypeId, employmentStatus: before.employmentStatus },
    after: { documentId: after.documentId, employeeTypeId: after.employeeTypeId, employmentStatus: after.employmentStatus },
  });
  return after;
}

/* ───────────── tiendas autorizadas y movilidad (RF-09, RF-10) ───────────── */

export type AccessKind = "permanente" | "temporal" | "movilidad";

export type StoreAccess = {
  id: string;
  employeeId: string;
  siteId: string;
  kind: AccessKind;
  fromSiteId: string | null;
  startDate: string | null;
  endDate: string | null;
  reason: string | null;
  authorizedBy: string;
  createdAt: string;
  revokedAt: string | null;
  revokedBy: string | null;
};

function mapAccess(row: Record<string, unknown>): StoreAccess {
  return {
    id: String(row.id),
    employeeId: String(row.employee_id),
    siteId: String(row.site_id),
    kind: row.kind as AccessKind,
    fromSiteId: row.from_site_id ? String(row.from_site_id) : null,
    startDate: row.start_date ? String(row.start_date) : null,
    endDate: row.end_date ? String(row.end_date) : null,
    reason: row.reason ? String(row.reason) : null,
    authorizedBy: String(row.authorized_by),
    createdAt: String(row.created_at),
    revokedAt: row.revoked_at ? String(row.revoked_at) : null,
    revokedBy: row.revoked_by ? String(row.revoked_by) : null,
  };
}

function activeOn(row: StoreAccess, date: string) {
  if (row.revokedAt) return false;
  if (row.startDate && date < row.startDate) return false;
  if (row.endDate && date > row.endDate) return false;
  return true;
}

function overlaps(row: StoreAccess, from: string, to: string) {
  if (row.revokedAt) return false;
  if (row.endDate && row.endDate < from) return false;
  if (row.startDate && row.startDate > to) return false;
  return true;
}

function accessRows(employeeId?: string): StoreAccess[] {
  const rows = employeeId
    ? getDb().prepare("SELECT * FROM store_access WHERE employee_id = ? ORDER BY created_at DESC").all(employeeId)
    : getDb().prepare("SELECT * FROM store_access ORDER BY created_at DESC").all();
  return (rows as Record<string, unknown>[]).map(mapAccess);
}

/** Tiendas donde el empleado puede marcar en una fecha: su tienda base + accesos vigentes. */
export function authorizedSiteIdsOn(employeeId: string, date: string): Set<string> {
  const employee = getEmployee(employeeId);
  const ids = new Set<string>();
  if (employee) ids.add(employee.siteId);
  for (const row of accessRows(employeeId)) if (activeOn(row, date)) ids.add(row.siteId);
  return ids;
}

export function listAccess(actor: StoreActor, filters: { employeeId?: string; includeRevoked?: boolean } = {}) {
  const allowed = allowedSiteIds(actor);
  return accessRows(filters.employeeId).filter(
    (r) =>
      (filters.includeRevoked || !r.revokedAt) &&
      (allowed === null || allowed.includes(r.siteId) || (r.fromSiteId != null && allowed.includes(r.fromSiteId))),
  );
}

function assertEmployeeInScope(actor: StoreActor, employeeId: string) {
  const employee = employeeOrThrow(employeeId);
  if (!inScope(actor, employee.siteId)) throw new DomainError("Empleado fuera de su alcance", 403, "FORBIDDEN");
  return employee;
}

/** Casilla empleado × tienda (UI-06). `endDate` vacío = permanente. */
export function setStoreAccess(
  input: { employeeId: string; siteId: string; enabled: boolean; startDate?: string | null; endDate?: string | null; reason?: string | null },
  actor: StoreActor,
) {
  requirePerm(actor, "access.manage");
  const employee = assertEmployeeInScope(actor, input.employeeId);
  const site = assertSiteScope(actor, input.siteId);
  if (site.id === employee.siteId) throw new DomainError("La tienda base siempre está autorizada");
  const startDate = input.startDate ? assertDate(input.startDate, "Inicio") : null;
  const endDate = input.endDate ? assertDate(input.endDate, "Fin") : null;
  if (startDate && endDate && endDate < startDate) throw new DomainError("La fecha fin es anterior al inicio");
  const now = new Date().toISOString();
  const current = accessRows(employee.id).filter((r) => r.siteId === site.id && r.kind !== "movilidad" && !r.revokedAt);
  if (input.enabled) {
    if (current.length) return current[0];
    const row: StoreAccess = {
      id: ulid(),
      employeeId: employee.id,
      siteId: site.id,
      kind: endDate ? "temporal" : "permanente",
      fromSiteId: null,
      startDate,
      endDate,
      reason: input.reason?.trim() || null,
      authorizedBy: actor.email,
      createdAt: now,
      revokedAt: null,
      revokedBy: null,
    };
    insertAccess(row);
    audit("store_access.granted", actor, { ...row });
    return row;
  }
  for (const row of current) {
    getDb().prepare("UPDATE store_access SET revoked_at = ?, revoked_by = ? WHERE id = ?").run(now, actor.email, row.id);
    audit("store_access.revoked", actor, { id: row.id, employeeId: employee.id, siteId: site.id });
  }
  return null;
}

function insertAccess(row: StoreAccess) {
  getDb()
    .prepare(
      `INSERT INTO store_access (id, employee_id, site_id, kind, from_site_id, start_date, end_date, reason, authorized_by, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(row.id, row.employeeId, row.siteId, row.kind, row.fromSiteId, row.startDate, row.endDate, row.reason, row.authorizedBy, row.createdAt);
}

export const MOBILITY_REASONS = ["cobertura", "incapacidad", "capacitación", "apertura/cierre", "otra"] as const;

/** Movilidad temporal entre tiendas de la jurisdicción (RF-10). No toca la tienda base. */
export function createMobility(
  input: { employeeId: string; toSiteId: string; startDate: string; endDate: string; reason: string; note?: string | null },
  actor: StoreActor,
) {
  requirePerm(actor, "mobility.manage");
  const employee = assertEmployeeInScope(actor, input.employeeId);
  const to = assertSiteScope(actor, input.toSiteId);
  const from = siteOrThrow(employee.siteId);
  if (to.id === from.id) throw new DomainError("Origen y destino son la misma tienda");
  const startDate = assertDate(input.startDate, "Inicio");
  const endDate = assertDate(input.endDate, "Fin");
  if (endDate < startDate) throw new DomainError("La fecha fin es anterior al inicio");
  const reason = input.reason?.trim();
  if (!reason) throw new DomainError("El motivo es obligatorio");
  const row: StoreAccess = {
    id: ulid(),
    employeeId: employee.id,
    siteId: to.id,
    kind: "movilidad",
    fromSiteId: from.id,
    startDate,
    endDate,
    reason: input.note?.trim() ? `${reason} — ${input.note.trim()}` : reason,
    authorizedBy: actor.email,
    createdAt: new Date().toISOString(),
    revokedAt: null,
    revokedBy: null,
  };
  insertAccess(row);
  audit("mobility.authorized", actor, { ...row, interCity: from.city !== to.city });
  return { ...row, interCity: from.city !== to.city };
}

export function revokeAccess(id: string, actor: StoreActor) {
  const row = accessRows().find((r) => r.id === id);
  if (!row) throw new DomainError("Autorización no encontrada", 404, "NOT_FOUND");
  requirePerm(actor, row.kind === "movilidad" ? "mobility.manage" : "access.manage");
  assertSiteScope(actor, row.siteId);
  if (row.revokedAt) return row;
  const now = new Date().toISOString();
  getDb().prepare("UPDATE store_access SET revoked_at = ?, revoked_by = ? WHERE id = ?").run(now, actor.email, id);
  audit(row.kind === "movilidad" ? "mobility.revoked" : "store_access.revoked", actor, { id, employeeId: row.employeeId, siteId: row.siteId });
  return { ...row, revokedAt: now, revokedBy: actor.email };
}

/**
 * Galería del kiosco: empleados de la misma zona que la tienda, con `authorized` según
 * los permisos vigentes. Reconocer a un no autorizado permite registrar la excepción
 * (RF-12) en vez de perder la marcación.
 */
export function kioskGallery(siteId: string): { employees: Array<Employee & { authorized: boolean }>; templates: FaceTemplate[] } {
  const site = siteOrThrow(siteId);
  const date = today(site.timezone);
  const zoneSites = listSites()
    .filter((s) => (site.zoneId ? s.zoneId === site.zoneId : s.id === site.id))
    .map((s) => s.id);
  const employees = listEmployees()
    .filter((e) => zoneSites.includes(e.siteId) && e.active && e.employmentStatus !== "retirado")
    .map((e) => ({ ...e, authorized: authorizedSiteIdsOn(e.id, date).has(site.id) }));
  if (!employees.length) return { employees: [], templates: [] };
  const ids = employees.map((e) => e.id);
  const rows = getDb()
    .prepare(`SELECT * FROM face_templates WHERE employee_id IN (${ids.map(() => "?").join(",")})`)
    .all(...ids) as Record<string, unknown>[];
  return {
    employees,
    templates: rows.map((row) => ({
      id: String(row.id),
      employeeId: String(row.employee_id),
      descriptor: openJson<number[]>(String(row.descriptor)),
      createdAt: String(row.created_at),
    })),
  };
}

/* ───────────── novedades (RF-11, RF-12, RF-14) ───────────── */

export type NoveltyKind = "programada" | "urgente" | "exceso";
export type NoveltyStatus = "registrada" | "pendiente" | "aprobada" | "rechazada";

export const PROGRAMMED_TYPES = ["vacaciones", "incapacidad", "capacitacion", "licencia", "retiro", "cambio_tienda", "otra"] as const;
export const URGENT_TYPES = ["marcacion_no_autorizada", "cobertura_urgente", "otra_urgente"] as const;

/** Novedades programadas que impiden que el empleado cubra un turno ese día. */
const BLOCKING_TYPES = new Set(["vacaciones", "incapacidad", "capacitacion", "licencia", "retiro"]);

export type Novelty = {
  id: string;
  kind: NoveltyKind;
  type: string;
  employeeId: string;
  employeeName: string | null;
  siteId: string | null;
  startDate: string;
  endDate: string;
  minutes: number | null;
  punchId: string | null;
  note: string | null;
  evidence: string | null;
  status: NoveltyStatus;
  createdBy: string;
  createdAt: string;
  decidedBy: string | null;
  decidedAt: string | null;
  decisionComment: string | null;
};

const NOVELTY_SELECT = `SELECT n.*, e.name AS employee_name, e.site_id AS home_site_id FROM novelties n LEFT JOIN employees e ON e.id = n.employee_id`;

function mapNovelty(row: Record<string, unknown>): Novelty {
  return {
    id: String(row.id),
    kind: row.kind as NoveltyKind,
    type: String(row.type),
    employeeId: String(row.employee_id),
    employeeName: row.employee_name ? String(row.employee_name) : null,
    siteId: row.site_id ? String(row.site_id) : row.home_site_id ? String(row.home_site_id) : null,
    startDate: String(row.start_date),
    endDate: String(row.end_date),
    minutes: row.minutes == null ? null : Number(row.minutes),
    punchId: row.punch_id ? String(row.punch_id) : null,
    note: row.note ? String(row.note) : null,
    evidence: row.evidence ? String(row.evidence) : null,
    status: row.status as NoveltyStatus,
    createdBy: String(row.created_by),
    createdAt: String(row.created_at),
    decidedBy: row.decided_by ? String(row.decided_by) : null,
    decidedAt: row.decided_at ? String(row.decided_at) : null,
    decisionComment: row.decision_comment ? String(row.decision_comment) : null,
  };
}

function getNovelty(id: string) {
  const row = getDb().prepare(`${NOVELTY_SELECT} WHERE n.id = ?`).get(id) as Record<string, unknown> | undefined;
  return row ? mapNovelty(row) : undefined;
}

function insertNovelty(n: Omit<Novelty, "employeeName" | "decidedBy" | "decidedAt" | "decisionComment">) {
  getDb()
    .prepare(
      `INSERT INTO novelties (id, kind, type, employee_id, site_id, start_date, end_date, minutes, punch_id, note, evidence, status, created_by, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(n.id, n.kind, n.type, n.employeeId, n.siteId, n.startDate, n.endDate, n.minutes, n.punchId, n.note, n.evidence, n.status, n.createdBy, n.createdAt);
  return getNovelty(n.id)!;
}

export function createNovelty(
  input: { kind: "programada" | "urgente"; type: string; employeeId: string; siteId?: string | null; startDate: string; endDate?: string | null; note?: string | null; evidence?: string | null },
  actor: StoreActor,
): Novelty {
  requirePerm(actor, "novelty.create");
  const employee = employeeOrThrow(input.employeeId);
  const siteId = input.siteId || employee.siteId;
  assertSiteScope(actor, siteId);
  const allowedTypes: readonly string[] = input.kind === "programada" ? PROGRAMMED_TYPES : URGENT_TYPES;
  if (!allowedTypes.includes(input.type)) throw new DomainError(`Tipo debe ser uno de: ${allowedTypes.join(", ")}`);
  const startDate = assertDate(input.startDate, "Inicio");
  const endDate = input.endDate ? assertDate(input.endDate, "Fin") : startDate;
  if (endDate < startDate) throw new DomainError("La fecha fin es anterior al inicio");
  if (input.kind === "urgente" && !input.note?.trim()) throw new DomainError("La causa es obligatoria en una novedad urgente");
  const novelty = insertNovelty({
    id: ulid(),
    kind: input.kind,
    type: input.type,
    employeeId: employee.id,
    siteId,
    startDate,
    endDate,
    minutes: null,
    punchId: null,
    note: input.note?.trim() || null,
    evidence: input.evidence?.trim() || null,
    status: input.kind === "programada" ? "registrada" : "pendiente",
    createdBy: actor.email,
    createdAt: new Date().toISOString(),
  });
  audit("novelty.created", actor, { id: novelty.id, kind: novelty.kind, type: novelty.type, employeeId: employee.id, siteId, startDate, endDate });
  if (novelty.status === "pendiente") {
    insertAlert("novelty.urgent", `Novedad urgente de ${employee.name}: ${novelty.type} — ${novelty.note ?? ""}`, siteId, employee.id);
  }
  return novelty;
}

export function decideNovelty(id: string, decision: "aprobada" | "rechazada", comment: string | null | undefined, actor: StoreActor) {
  requirePerm(actor, "novelty.decide");
  const novelty = getNovelty(id);
  if (!novelty) throw new DomainError("Novedad no encontrada", 404, "NOT_FOUND");
  if (novelty.siteId) assertSiteScope(actor, novelty.siteId);
  if (novelty.status !== "pendiente") throw new DomainError(`La novedad ya está ${novelty.status}`, 409, "CONFLICT");
  if (decision === "rechazada" && !comment?.trim()) throw new DomainError("El rechazo exige un comentario");
  const now = new Date().toISOString();
  getDb()
    .prepare("UPDATE novelties SET status = ?, decided_by = ?, decided_at = ?, decision_comment = ? WHERE id = ?")
    .run(decision, actor.email, now, comment?.trim() || null, id);
  audit("novelty.decided", actor, { id, employeeId: novelty.employeeId, siteId: novelty.siteId, before: novelty.status, after: decision, comment: comment?.trim() || null, punchId: novelty.punchId });
  return getNovelty(id)!;
}

export function listNovelties(
  actor: StoreActor,
  filters: { status?: string; kind?: string; employeeId?: string; siteId?: string; from?: string; to?: string } = {},
): Novelty[] {
  requirePerm(actor, "novelty.view");
  const conditions: Array<[string, string | undefined]> = [
    ["n.status = ?", filters.status],
    ["n.kind = ?", filters.kind],
    ["n.employee_id = ?", filters.employeeId],
    ["COALESCE(n.site_id, e.site_id) = ?", filters.siteId],
    ["n.end_date >= ?", filters.from],
    ["n.start_date <= ?", filters.to],
  ];
  const active = conditions.filter(([, value]) => value);
  const clauses = active.map(([sql]) => sql);
  const params = active.map(([, value]) => value);
  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  const rows = getDb().prepare(`${NOVELTY_SELECT} ${where} ORDER BY n.created_at DESC LIMIT 500`).all(...params) as Record<string, unknown>[];
  const allowed = allowedSiteIds(actor);
  return rows.map(mapNovelty).filter((n) => allowed === null || (n.siteId != null && allowed.includes(n.siteId)));
}

function noveltiesFor(employeeIds: string[], from: string, to: string): Novelty[] {
  if (!employeeIds.length) return [];
  const rows = getDb()
    .prepare(
      `${NOVELTY_SELECT} WHERE n.employee_id IN (${employeeIds.map(() => "?").join(",")}) AND n.end_date >= ? AND n.start_date <= ? AND n.status <> 'rechazada'`,
    )
    .all(...employeeIds, from, to) as Record<string, unknown>[];
  return rows.map(mapNovelty);
}

/* ───────────── cronograma semanal (RF-04, RF-05, RF-06, RF-11) ───────────── */

export type PlanStatus = "borrador" | "enviado" | "aprobado" | "devuelto" | "sustituido";

export type ShiftPlan = {
  id: string;
  siteId: string;
  weekStart: string;
  version: number;
  status: PlanStatus;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  submittedBy: string | null;
  submittedAt: string | null;
  decidedBy: string | null;
  decidedAt: string | null;
  comment: string | null;
  changeReason: string | null;
};

function mapPlan(row: Record<string, unknown>): ShiftPlan {
  return {
    id: String(row.id),
    siteId: String(row.site_id),
    weekStart: String(row.week_start),
    version: Number(row.version),
    status: row.status as PlanStatus,
    createdBy: String(row.created_by),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
    submittedBy: row.submitted_by ? String(row.submitted_by) : null,
    submittedAt: row.submitted_at ? String(row.submitted_at) : null,
    decidedBy: row.decided_by ? String(row.decided_by) : null,
    decidedAt: row.decided_at ? String(row.decided_at) : null,
    comment: row.comment ? String(row.comment) : null,
    changeReason: row.change_reason ? String(row.change_reason) : null,
  };
}

function plansFor(siteId: string, weekStart: string): ShiftPlan[] {
  return (getDb()
    .prepare("SELECT * FROM shift_plans WHERE site_id = ? AND week_start = ? ORDER BY version DESC")
    .all(siteId, weekStart) as Record<string, unknown>[]).map(mapPlan);
}

function planById(id: string) {
  const row = getDb().prepare("SELECT * FROM shift_plans WHERE id = ?").get(id) as Record<string, unknown> | undefined;
  if (!row) throw new DomainError("Cronograma no encontrado", 404, "NOT_FOUND");
  return mapPlan(row);
}

function cellsOf(planId: string): PlanCell[] {
  return (getDb().prepare("SELECT * FROM shift_cells WHERE plan_id = ? ORDER BY employee_id, date").all(planId) as Record<string, unknown>[]).map(
    (row) => ({
      employeeId: String(row.employee_id),
      date: String(row.date),
      kind: row.kind as CellKind,
      startHm: row.start_hm ? String(row.start_hm) : null,
      endHm: row.end_hm ? String(row.end_hm) : null,
      lunchMin: row.lunch_min == null ? null : Number(row.lunch_min),
      note: row.note ? String(row.note) : null,
    }),
  );
}

export type PlannerEmployee = {
  id: string;
  name: string;
  code: string;
  role: string;
  typeId: string | null;
  typeName: string | null;
  isLead: boolean;
  weeklyHours: number | null;
  minWeeklyHours: number | null;
  daysPerWeek: number | null;
  missing: string[];
  /** Préstamo desde otra tienda (movilidad/acceso temporal) y fechas en que puede programarse aquí. */
  guestFrom: { siteId: string; siteName: string; dates: string[] } | null;
  /** Fechas en que el empleado base está en movilidad hacia otra tienda. */
  awayDates: Array<{ date: string; siteName: string }>;
};

function plannerEmployees(site: Site, dates: string[]): PlannerEmployee[] {
  const types = typesById();
  const sites = new Map(listSites().map((s) => [s.id, s]));
  const from = dates[0];
  const to = dates[dates.length - 1];
  const all = listEmployees().filter((e) => e.active && e.employmentStatus !== "retirado");
  const access = accessRows().filter((r) => overlaps(r, from, to));
  const result: PlannerEmployee[] = [];
  for (const e of all) {
    const type = e.employeeTypeId ? types.get(e.employeeTypeId) : undefined;
    const base = {
      id: e.id,
      name: e.name,
      code: e.code,
      role: e.role,
      typeId: type?.id ?? null,
      typeName: type?.name ?? null,
      isLead: Boolean(type?.isShiftLead),
      weeklyHours: type?.weeklyHours ?? null,
      minWeeklyHours: type?.minWeeklyHours ?? null,
      daysPerWeek: type?.daysPerWeek ?? null,
      missing: missingForPlanning(e),
    };
    const mine = access.filter((r) => r.employeeId === e.id);
    if (e.siteId === site.id) {
      const awayDates = mine
        .filter((r) => r.kind === "movilidad" && r.siteId !== site.id)
        .flatMap((r) => dates.filter((d) => activeOn(r, d)).map((d) => ({ date: d, siteName: sites.get(r.siteId)?.name ?? r.siteId })));
      result.push({ ...base, guestFrom: null, awayDates });
      continue;
    }
    const here = mine.filter((r) => r.siteId === site.id && r.kind !== "permanente");
    const guestDates = dates.filter((d) => here.some((r) => activeOn(r, d)));
    if (guestDates.length) {
      result.push({
        ...base,
        guestFrom: { siteId: e.siteId, siteName: sites.get(e.siteId)?.name ?? e.siteId, dates: guestDates },
        awayDates: [],
      });
    }
  }
  return result.sort((a, b) => Number(b.isLead) - Number(a.isLead) || a.name.localeCompare(b.name));
}

export type PlanView = {
  site: Site;
  weekStart: string;
  dates: string[];
  plan: ShiftPlan | null;
  approved: ShiftPlan | null;
  versions: ShiftPlan[];
  employees: PlannerEmployee[];
  cells: PlanCell[];
  totals: Record<string, number>;
  novelties: Novelty[];
  coverage: CoverageGap[];
  opensHm: string;
  closesHm: string;
  hoursConfirmed: boolean;
  warnings: Array<{ employeeId: string | null; message: string }>;
};

const DEFAULT_OPEN = "07:00";
const DEFAULT_CLOSE = "22:00";

export function getPlanView(siteId: string, weekStartInput: string, actor: StoreActor, opts: { planId?: string } = {}): PlanView {
  requirePerm(actor, "plan.view");
  const site = assertSiteScope(actor, siteId);
  const weekStart = mondayOf(assertDate(weekStartInput, "Semana"));
  const dates = weekDates(weekStart);
  const versions = plansFor(site.id, weekStart);
  const plan = opts.planId ? versions.find((p) => p.id === opts.planId) ?? null : versions[0] ?? null;
  const approved = versions.find((p) => p.status === "aprobado") ?? null;
  const employees = plannerEmployees(site, dates);
  const cells = plan ? cellsOf(plan.id) : [];
  const totals = totalsByEmployee(cells);
  const novelties = noveltiesFor(employees.map((e) => e.id), dates[0], dates[6]);
  const blocked = new Set(
    novelties
      .filter((n) => n.kind === "programada" && BLOCKING_TYPES.has(n.type))
      .flatMap((n) => dates.filter((d) => d >= n.startDate && d <= n.endDate).map((d) => `${n.employeeId}|${d}`)),
  );
  for (const e of employees) for (const a of e.awayDates) blocked.add(`${e.id}|${a.date}`);
  const opensHm = site.opensHm || DEFAULT_OPEN;
  const closesHm = site.closesHm || DEFAULT_CLOSE;
  const coverage = coverageGaps({
    dates,
    opensHm,
    closesHm,
    cells: cells.filter((c) => !blocked.has(`${c.employeeId}|${c.date}`)),
    leadIds: new Set(employees.filter((e) => e.isLead).map((e) => e.id)),
  });
  const warnings: PlanView["warnings"] = [];
  if (!employees.some((e) => e.isLead)) warnings.push({ employeeId: null, message: "La tienda no tiene gerente ni coordinador asignado." });
  for (const e of employees) {
    const mine = cells.filter((c) => c.employeeId === e.id);
    const total = totals[e.id] ?? 0;
    const workDays = mine.filter((c) => c.kind === "turno").length;
    if (e.missing.length) warnings.push({ employeeId: e.id, message: `${e.name}: ficha incompleta (${e.missing.join(", ")}); no planificable.` });
    if (e.weeklyHours != null && total > e.weeklyHours * 60) {
      warnings.push({ employeeId: e.id, message: `${e.name}: ${Math.round(total / 6) / 10} h superan la jornada de referencia (${e.weeklyHours} h).` });
    }
    if (e.minWeeklyHours != null && mine.length && total < e.minWeeklyHours * 60) {
      warnings.push({ employeeId: e.id, message: `${e.name}: ${Math.round(total / 6) / 10} h por debajo del mínimo (${e.minWeeklyHours} h).` });
    }
    if (e.daysPerWeek != null && workDays > e.daysPerWeek) {
      warnings.push({ employeeId: e.id, message: `${e.name}: ${workDays} días de turno; su tipo prevé ${e.daysPerWeek}.` });
    }
    if (!e.guestFrom && workDays === 7) warnings.push({ employeeId: e.id, message: `${e.name}: sin día de descanso en la semana.` });
    for (const c of mine) {
      if (c.kind === "turno" && blocked.has(`${e.id}|${c.date}`)) {
        warnings.push({ employeeId: e.id, message: `${e.name}: turno el ${c.date} con novedad o movilidad registrada.` });
      }
    }
  }
  return {
    site,
    weekStart,
    dates,
    plan,
    approved,
    versions,
    employees,
    cells,
    totals,
    novelties,
    coverage,
    opensHm,
    closesHm,
    hoursConfirmed: Boolean(site.opensHm && site.closesHm),
    warnings,
  };
}

/** Crea el borrador de la semana, o una nueva versión si la vigente ya fue enviada/aprobada (RF-05). */
export function openPlan(siteId: string, weekStartInput: string, actor: StoreActor, changeReason?: string | null): ShiftPlan {
  requirePerm(actor, "plan.edit");
  const site = assertSiteScope(actor, siteId);
  const weekStart = mondayOf(assertDate(weekStartInput, "Semana"));
  const versions = plansFor(site.id, weekStart);
  const latest = versions[0];
  if (latest && (latest.status === "borrador" || latest.status === "devuelto")) return latest;
  if (latest?.status === "enviado") {
    throw new DomainError("La versión vigente está en revisión regional; espere la decisión.", 409, "CONFLICT");
  }
  if (latest && !changeReason?.trim()) {
    throw new DomainError("Una nueva versión de un cronograma aprobado exige justificar el cambio.");
  }
  const now = new Date().toISOString();
  const plan: ShiftPlan = {
    id: ulid(),
    siteId: site.id,
    weekStart,
    version: (latest?.version ?? 0) + 1,
    status: "borrador",
    createdBy: actor.email,
    createdAt: now,
    updatedAt: now,
    submittedBy: null,
    submittedAt: null,
    decidedBy: null,
    decidedAt: null,
    comment: null,
    changeReason: changeReason?.trim() || null,
  };
  const db = getDb();
  db.transaction(() => {
    db.prepare(
      `INSERT INTO shift_plans (id, site_id, week_start, version, status, created_by, created_at, updated_at, change_reason)
       VALUES (?, ?, ?, ?, 'borrador', ?, ?, ?, ?)`,
    ).run(plan.id, site.id, weekStart, plan.version, actor.email, now, now, plan.changeReason);
    if (latest) {
      db.prepare(
        `INSERT INTO shift_cells (plan_id, employee_id, date, kind, start_hm, end_hm, lunch_min, note)
         SELECT ?, employee_id, date, kind, start_hm, end_hm, lunch_min, note FROM shift_cells WHERE plan_id = ?`,
      ).run(plan.id, latest.id);
    }
  })();
  audit("plan.opened", actor, { planId: plan.id, siteId: site.id, weekStart, version: plan.version, from: latest?.id ?? null, changeReason: plan.changeReason });
  return plan;
}

export type CellInput = Omit<PlanCell, "kind"> & { kind: CellKind | null };

export function savePlanCells(planId: string, cells: CellInput[], actor: StoreActor) {
  requirePerm(actor, "plan.edit");
  const plan = planById(planId);
  const site = assertSiteScope(actor, plan.siteId);
  if (plan.status !== "borrador" && plan.status !== "devuelto") {
    throw new DomainError(`El cronograma está ${plan.status}; abra una nueva versión para cambiarlo.`, 409, "CONFLICT");
  }
  const dates = weekDates(plan.weekStart);
  const employees = new Map(plannerEmployees(site, dates).map((e) => [e.id, e]));
  const errors: string[] = [];
  for (const cell of cells) {
    const employee = employees.get(cell.employeeId);
    const label = `${employee?.name ?? cell.employeeId} ${cell.date}`;
    if (!employee) errors.push(`${label}: no pertenece ni está autorizado en esta tienda`);
    else if (cell.kind && employee.missing.length) errors.push(`${label}: ficha incompleta (${employee.missing.join(", ")})`);
    else if (employee.guestFrom && cell.kind && !employee.guestFrom.dates.includes(cell.date)) {
      errors.push(`${label}: fuera del período de movilidad autorizado`);
    }
    if (!dates.includes(cell.date)) errors.push(`${label}: fecha fuera de la semana`);
    if (cell.kind) for (const e of validateCell(cell as PlanCell)) errors.push(`${label}: ${e}`);
  }
  if (errors.length) throw new DomainError(errors.slice(0, 8).join("; "));
  const db = getDb();
  db.transaction(() => {
    const del = db.prepare("DELETE FROM shift_cells WHERE plan_id = ? AND employee_id = ? AND date = ?");
    const ins = db.prepare(
      "INSERT INTO shift_cells (plan_id, employee_id, date, kind, start_hm, end_hm, lunch_min, note) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    );
    for (const cell of cells) {
      del.run(planId, cell.employeeId, cell.date);
      if (!cell.kind) continue;
      const turno = cell.kind === "turno";
      ins.run(
        planId,
        cell.employeeId,
        cell.date,
        cell.kind,
        turno ? cell.startHm : null,
        turno ? cell.endHm : null,
        turno ? cell.lunchMin ?? 0 : null,
        cell.note?.trim() || null,
      );
    }
    db.prepare("UPDATE shift_plans SET updated_at = ? WHERE id = ?").run(new Date().toISOString(), planId);
  })();
  audit("plan.updated", actor, { planId, siteId: site.id, weekStart: plan.weekStart, version: plan.version, changes: cells.length });
  return getPlanView(site.id, plan.weekStart, actor, { planId });
}

export function submitPlan(planId: string, actor: StoreActor) {
  requirePerm(actor, "plan.submit");
  const plan = planById(planId);
  const site = assertSiteScope(actor, plan.siteId);
  if (plan.status !== "borrador" && plan.status !== "devuelto") {
    throw new DomainError(`Solo se envía un borrador o un devuelto (está ${plan.status}).`, 409, "CONFLICT");
  }
  if (cellsOf(planId).length === 0) throw new DomainError("El cronograma está vacío.");
  const now = new Date().toISOString();
  getDb()
    .prepare("UPDATE shift_plans SET status = 'enviado', submitted_by = ?, submitted_at = ?, updated_at = ? WHERE id = ?")
    .run(actor.email, now, now, planId);
  const view = getPlanView(site.id, plan.weekStart, actor, { planId });
  audit("plan.submitted", actor, { planId, siteId: site.id, weekStart: plan.weekStart, version: plan.version, before: plan.status, coverageGaps: view.coverage.length });
  insertAlert(
    "plan.submitted",
    `Cronograma ${site.name} · semana ${plan.weekStart} · v${plan.version} enviado por ${actor.name} (${view.coverage.length} franjas sin responsable).`,
    site.id,
  );
  return view;
}

export function decidePlan(planId: string, decision: "aprobado" | "devuelto", comment: string | null | undefined, actor: StoreActor) {
  requirePerm(actor, "plan.decide");
  const plan = planById(planId);
  const site = assertSiteScope(actor, plan.siteId);
  if (plan.status !== "enviado") throw new DomainError(`Solo se decide un cronograma enviado (está ${plan.status}).`, 409, "CONFLICT");
  if (decision === "devuelto" && !comment?.trim()) throw new DomainError("La devolución exige observaciones.");
  const now = new Date().toISOString();
  const db = getDb();
  db.transaction(() => {
    if (decision === "aprobado") {
      db.prepare("UPDATE shift_plans SET status = 'sustituido', updated_at = ? WHERE site_id = ? AND week_start = ? AND status = 'aprobado'").run(
        now,
        plan.siteId,
        plan.weekStart,
      );
    }
    db.prepare("UPDATE shift_plans SET status = ?, decided_by = ?, decided_at = ?, comment = ?, updated_at = ? WHERE id = ?").run(
      decision,
      actor.email,
      now,
      comment?.trim() || null,
      now,
      planId,
    );
  })();
  const view = getPlanView(site.id, plan.weekStart, actor, { planId });
  audit("plan.decided", actor, {
    planId,
    siteId: site.id,
    weekStart: plan.weekStart,
    version: plan.version,
    before: plan.status,
    after: decision,
    comment: comment?.trim() || null,
    coverageGaps: view.coverage.length,
  });
  return view;
}

/** Cronogramas de la semana para todas las tiendas visibles (UI-03, CP-05). */
export function regionPlans(actor: StoreActor, weekStart: string) {
  requirePerm(actor, "plan.view");
  const allowed = allowedSiteIds(actor);
  return listSites()
    .filter((s) => allowed === null || allowed.includes(s.id))
    .map((s) => getPlanView(s.id, weekStart, actor));
}

/* ───────────── horas: previsto vs. efectivo (RF-08, RF-13, RF-14, RF-15) ───────────── */

export type HoursRow = {
  employeeId: string;
  employeeName: string;
  employeeCode: string;
  documentId: string | null;
  siteId: string;
  siteName: string;
  zoneId: string | null;
  role: string;
  typeName: string | null;
  salary?: number | null;
  referenceMin: number | null;
  minimumMin: number | null;
  plannedMin: number | null;
  workedMin: number;
  lunchMin: number;
  diffMin: number | null;
  excessMin: number;
  shortfallMin: number;
  restDays: number;
  incidents: number;
  days: Array<{ date: string; plannedMin: number | null; plannedKind: CellKind | null; workday: Workday | null }>;
  excessNovelty: { id: string; status: NoveltyStatus } | null;
  pendingReview: boolean;
};

function approvedCellsForWeek(weekStart: string) {
  const plans = getDb().prepare("SELECT id FROM shift_plans WHERE week_start = ? AND status = 'aprobado'").all(weekStart) as Array<{ id: string }>;
  return plans.flatMap((p) => cellsOf(p.id));
}

function hoursFor(employee: Employee, weekStart: string, approvedCells: PlanCell[], sites: Map<string, Site>, types: Map<string, EmployeeType>, salary: number | null = null): HoursRow {
  const dates = weekDates(weekStart);
  const home = sites.get(employee.siteId);
  const type = employee.employeeTypeId ? types.get(employee.employeeTypeId) : undefined;
  const punches = listPunches({
    employeeId: employee.id,
    from: `${addDays(weekStart, -1)}T00:00:00Z`,
    to: `${addDays(weekStart, 8)}T00:00:00Z`,
    limit: 5000,
    order: "asc",
  }).filter((p) => p.decision === "matched" || p.decision === "queued");
  const byDate = new Map<string, Punch[]>();
  for (const p of punches) {
    const tz = sites.get(p.siteId)?.timezone ?? home?.timezone ?? "America/Bogota";
    const date = localDateTime(p.capturedAt, tz).date;
    if (!dates.includes(date)) continue;
    byDate.set(date, [...(byDate.get(date) ?? []), p]);
  }
  const mine = approvedCells.filter((c) => c.employeeId === employee.id);
  const hasPlan = mine.length > 0;
  const tz = home?.timezone ?? "America/Bogota";
  const days = dates.map((date) => {
    const cell = mine.find((c) => c.date === date) ?? null;
    const dayPunches = byDate.get(date) ?? [];
    return {
      date,
      plannedMin: hasPlan ? (cell ? cellMinutes(cell) : 0) : null,
      plannedKind: cell?.kind ?? null,
      workday: dayPunches.length ? computeWorkday(dayPunches, tz, type?.lunchMin ?? 30) : null,
    };
  });
  const workedMin = days.reduce((sum, d) => sum + (d.workday?.workedMin ?? 0), 0);
  const lunchMin = days.reduce((sum, d) => sum + (d.workday?.lunchMin ?? 0), 0);
  const plannedMin = hasPlan ? days.reduce((sum, d) => sum + (d.plannedMin ?? 0), 0) : null;
  const referenceMin = type?.weeklyHours != null ? Math.round(type.weeklyHours * 60) : null;
  const minimumMin = type?.minWeeklyHours != null ? Math.round(type.minWeeklyHours * 60) : null;
  const excess = getDb()
    .prepare("SELECT id, status FROM novelties WHERE employee_id = ? AND kind = 'exceso' AND start_date = ? ORDER BY created_at DESC LIMIT 1")
    .get(employee.id, weekStart) as { id: string; status: NoveltyStatus } | undefined;
  const incidents = days.reduce((sum, d) => sum + (d.workday?.incidents.length ?? 0), 0);
  const excessMin = referenceMin != null ? Math.max(0, workedMin - referenceMin) : 0;
  return {
    employeeId: employee.id,
    employeeName: employee.name,
    employeeCode: employee.code,
    documentId: employee.documentId ?? null,
    siteId: employee.siteId,
    siteName: home?.name ?? employee.siteId,
    zoneId: home?.zoneId ?? null,
    role: employee.role,
    typeName: type?.name ?? null,
    salary,
    referenceMin,
    minimumMin,
    plannedMin,
    workedMin,
    lunchMin,
    diffMin: plannedMin == null ? null : workedMin - plannedMin,
    excessMin,
    shortfallMin: minimumMin != null ? Math.max(0, minimumMin - workedMin) : 0,
    restDays: days.filter((d) => d.plannedKind === "descanso").length,
    incidents,
    days,
    excessNovelty: excess ?? null,
    pendingReview: incidents > 0 || excess?.status === "pendiente" || (excessMin > 0 && !excess),
  };
}

export function weeklyHours(
  actor: StoreActor,
  filters: { weekStart: string; siteId?: string; zoneId?: string; employeeId?: string; review?: "pendiente" | "ok" },
): HoursRow[] {
  requirePerm(actor, "hours.view");
  const weekStart = mondayOf(assertDate(filters.weekStart, "Semana"));
  if (filters.siteId) assertSiteScope(actor, filters.siteId);
  const allowed = allowedSiteIds(actor);
  const sites = new Map(listSites().map((s) => [s.id, s]));
  const types = typesById();
  const approved = approvedCellsForWeek(weekStart);
  const salaries = salaryMap(actor);
  return listEmployees()
    .filter((e) => allowed === null || allowed.includes(e.siteId))
    .filter((e) => !filters.siteId || e.siteId === siteOrThrow(filters.siteId).id)
    .filter((e) => !filters.zoneId || sites.get(e.siteId)?.zoneId === filters.zoneId)
    .filter((e) => !filters.employeeId || e.id === filters.employeeId)
    .map((e) => hoursFor(e, weekStart, approved, sites, types, salaries?.get(e.id) ?? null))
    .filter((r) => !filters.review || (filters.review === "pendiente" ? r.pendingReview : !r.pendingReview));
}

/** RF-13/RF-14: un exceso sobre la jornada de referencia se envía a revisión; nunca se liquida solo. */
export function flagExcess(employeeId: string, weekStart: string) {
  const employee = getEmployee(employeeId);
  if (!employee) return null;
  const sites = new Map(listSites().map((s) => [s.id, s]));
  const row = hoursFor(employee, weekStart, approvedCellsForWeek(weekStart), sites, typesById());
  if (row.excessMin <= 0) return null;
  const existing = row.excessNovelty;
  if (existing?.status === "pendiente") {
    getDb().prepare("UPDATE novelties SET minutes = ? WHERE id = ?").run(row.excessMin, existing.id);
    return getNovelty(existing.id) ?? null;
  }
  if (existing) return null; // ya decidido: el regional decide de nuevo solo si se reabre
  const novelty = insertNovelty({
    id: ulid(),
    kind: "exceso",
    type: "horas_adicionales",
    employeeId,
    siteId: employee.siteId,
    startDate: weekStart,
    endDate: addDays(weekStart, 6),
    minutes: row.excessMin,
    punchId: null,
    note: `Supera la jornada de referencia (${(row.referenceMin ?? 0) / 60} h) en ${row.excessMin} min. Requiere autorización; no se liquida automáticamente.`,
    evidence: null,
    status: "pendiente",
    createdBy: SYSTEM,
    createdAt: new Date().toISOString(),
  });
  audit("novelty.created", null, { id: novelty.id, kind: "exceso", employeeId, weekStart, minutes: row.excessMin });
  insertAlert("hours.excess", `${employee.name} supera la jornada de referencia en ${row.excessMin} min (semana ${weekStart}).`, employee.siteId, employeeId);
  return novelty;
}

/* ───────────── marcaciones entrantes (RF-07, RF-12) ───────────── */

/**
 * Punto único de entrada de marcaciones (kiosco, PIN y cola offline).
 * - Entrada después de «salida a almuerzo» queda como regreso de almuerzo (BREAK_END).
 * - Marcar en una tienda no autorizada no se bloquea ni se borra: queda como excepción
 *   urgente pendiente de revisión regional (política de bloqueo físico POR VALIDAR).
 * - Una salida final recalcula la semana y escala excesos.
 */
export function ingestPunch(item: SyncItem & { offline?: boolean }) {
  const exists = getDb().prepare("SELECT 1 FROM punches WHERE id = ?").get(item.id);
  const site = siteOrThrow(item.siteId);
  const matched = Boolean(item.employeeId) && item.decision === "matched";
  const next = { ...item };
  if (!exists && matched && item.type === "IN") {
    const date = localDateTime(item.capturedAt, site.timezone).date;
    const last = listPunches({ employeeId: item.employeeId!, to: item.capturedAt, limit: 1, order: "desc" }).find(
      (p) => p.decision === "matched" && localDateTime(p.capturedAt, site.timezone).date === date,
    );
    if (last?.type === "BREAK_START") {
      next.type = "BREAK_END";
      next.eventType = "BREAK_END";
    }
  }
  const result = upsertPunch(next);
  let exception: Novelty | null = null;
  if (result.created && matched) {
    const date = localDateTime(next.capturedAt, site.timezone).date;
    const authorized = authorizedSiteIdsOn(next.employeeId!, date).has(site.id);
    getDb().prepare("UPDATE punches SET store_authorized = ? WHERE id = ?").run(authorized ? 1 : 0, next.id);
    if (!authorized) {
      const employee = getEmployee(next.employeeId!);
      exception = insertNovelty({
        id: ulid(),
        kind: "urgente",
        type: "marcacion_no_autorizada",
        employeeId: next.employeeId!,
        siteId: site.id,
        startDate: date,
        endDate: date,
        minutes: null,
        punchId: next.id,
        note: `Marcó ${next.type} en ${site.name} sin autorización vigente (tienda base: ${employee ? getSiteByCode(employee.siteId)?.name ?? employee.siteId : "?"}).`,
        evidence: `punch:${next.id} · método ${next.method ?? "face"} · score ${next.matchScore ?? "—"}`,
        status: "pendiente",
        createdBy: SYSTEM,
        createdAt: new Date().toISOString(),
      });
      audit("novelty.created", null, { id: exception.id, kind: "urgente", type: exception.type, punchId: next.id, siteId: site.id });
      insertAlert("punch.unauthorized_store", `Marcación excepcional: ${employee?.name ?? next.employeeId} en ${site.name}. Pendiente de revisión.`, site.id, next.employeeId);
    }
    if (next.type === "OUT") flagExcess(next.employeeId!, mondayOf(date));
  }
  const punch = getDb().prepare("SELECT store_authorized, type FROM punches WHERE id = ?").get(next.id) as { store_authorized: number | null; type: string };
  return {
    punch: { ...result.punch, type: punch.type, eventType: punch.type, storeAuthorized: punch.store_authorized == null ? null : Boolean(punch.store_authorized) },
    created: result.created,
    exception,
  };
}

/** Horario de apertura de la tienda, base de la alerta de cobertura (RF-06). */
export function setSiteHours(siteId: string, opensHm: string, closesHm: string, actor: StoreActor) {
  requirePerm(actor, "access.manage");
  const site = assertSiteScope(actor, siteId);
  if (!isHm(opensHm) || !isHm(closesHm)) throw new DomainError("Apertura y cierre en formato HH:MM");
  // Un cierre menor que la apertura es de madrugada del día siguiente (tiendas que cierran después de medianoche).
  if (closesHm === opensHm) throw new DomainError("La apertura y el cierre no pueden ser iguales");
  getDb().prepare("UPDATE sites SET opens_hm = ?, closes_hm = ? WHERE id = ?").run(opensHm, closesHm, site.id);
  audit("site.hours_updated", actor, { siteId: site.id, before: { opensHm: site.opensHm, closesHm: site.closesHm }, after: { opensHm, closesHm } });
  return siteOrThrow(site.id);
}

/* ───────────── inicio regional (UI-02) ───────────── */

export function regionSummary(actor: StoreActor, weekStartInput: string) {
  requirePerm(actor, "plan.view");
  const weekStart = mondayOf(assertDate(weekStartInput, "Semana"));
  const allowed = allowedSiteIds(actor);
  const sites = listSites().filter((s) => allowed === null || allowed.includes(s.id));
  const zones = getDb().prepare("SELECT id, name FROM zones").all() as Array<{ id: string; name: string }>;
  const views = sites.map((s) => getPlanView(s.id, weekStart, actor));
  const byZone = new Map<string, typeof views>();
  for (const v of views) {
    const key = v.site.zoneId ?? "sin-zona";
    byZone.set(key, [...(byZone.get(key) ?? []), v]);
  }
  const pendingNovelties = can(actor.role, "novelty.view") ? listNovelties(actor, { status: "pendiente" }) : [];
  return {
    weekStart,
    zones: [...byZone.entries()].map(([zoneId, list]) => ({
      id: zoneId,
      name: zones.find((z) => z.id === zoneId)?.name ?? "Sin zona",
      cities: [...new Set(list.map((v) => v.site.city))].map((city) => ({
        city,
        sites: list
          .filter((v) => v.site.city === city)
          .map((v) => ({
            site: v.site,
            employees: v.employees.filter((e) => !e.guestFrom).length,
            guests: v.employees.filter((e) => e.guestFrom).length,
            incomplete: v.employees.filter((e) => e.missing.length).length,
            plan: v.plan ? { id: v.plan.id, status: v.plan.status, version: v.plan.version } : null,
            approved: Boolean(v.approved),
            coverageGaps: v.coverage.length,
            warnings: v.warnings.length,
          })),
      })),
    })),
    pending: {
      plans: views.filter((v) => v.plan?.status === "enviado").map((v) => ({ planId: v.plan!.id, siteId: v.site.id, site: v.site.name, version: v.plan!.version })),
      novelties: pendingNovelties.length,
      urgent: pendingNovelties.filter((n) => n.kind === "urgente").length,
      excess: pendingNovelties.filter((n) => n.kind === "exceso").length,
    },
  };
}
