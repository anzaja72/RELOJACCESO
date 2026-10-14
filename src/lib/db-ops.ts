import { ulid } from "ulidx";
import { classifyEmployee, type Exception, type Schedule } from "@/lib/attendance-rules";
import { getDb, listEmployees, listPunches, listSites, listTerminals, recordEvent } from "@/lib/db";
import { daysOfMonth, hmToMin, summarizeMonth, type DaySchedule, type PayCfg } from "@/lib/payroll";
import { supervisorPin } from "@/lib/secrets";
import { hashPassword, verifyPassword, type Role, type SessionUser } from "@/lib/session";
import type { Employee, Punch } from "@/lib/types";
import { TIMEZONE, dayBoundsUtc, localNoon } from "@/lib/config";
import { postSigned } from "@/lib/webhook";

export type UserRow = {
  id: string;
  email: string;
  name: string;
  role: Role;
  scope_type: SessionUser["scopeType"];
  scope_id: string | null;
  password_hash: string;
  totp_secret: string | null;
  totp_enabled: number;
  active: number;
};

export function listCountries() {
  return getDb().prepare("SELECT * FROM countries ORDER BY name").all();
}

export function listZones(countryId?: string) {
  const db = getDb();
  if (countryId) {
    return db.prepare("SELECT * FROM zones WHERE country_id = ? ORDER BY name").all(countryId);
  }
  return db.prepare("SELECT * FROM zones ORDER BY name").all();
}

export function getSetting(key: string): string | null {
  const row = getDb().prepare("SELECT value FROM settings WHERE key = ?").get(key) as
    | { value: string }
    | undefined;
  return row?.value ?? null;
}

export function setSetting(key: string, value: string) {
  getDb()
    .prepare(
      "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
    )
    .run(key, value);
}

export function listSettings() {
  const rows = getDb().prepare("SELECT key, value FROM settings ORDER BY key").all() as Array<{
    key: string;
    value: string;
  }>;
  return Object.fromEntries(rows.map((r) => [r.key, r.value]));
}

export function eventTypes(): string[] {
  try {
    const raw = getSetting("event_types");
    const parsed = raw ? (JSON.parse(raw) as string[]) : [];
    return parsed.length ? parsed : ["IN", "OUT", "BREAK_START", "BREAK_END"];
  } catch {
    return ["IN", "OUT", "BREAK_START", "BREAK_END"];
  }
}

export function listUsersPublic() {
  return getDb()
    .prepare(
      "SELECT id, email, name, role, scope_type, scope_id, totp_enabled, active, created_at FROM users ORDER BY name",
    )
    .all();
}

export function findUserByEmail(email: string): UserRow | undefined {
  return getDb().prepare("SELECT * FROM users WHERE email = ?").get(email.toLowerCase()) as
    | UserRow
    | undefined;
}

export function findUserById(id: string): UserRow | undefined {
  return getDb().prepare("SELECT * FROM users WHERE id = ?").get(id) as UserRow | undefined;
}

export function toSession(user: UserRow): SessionUser {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    scopeType: user.scope_type,
    scopeId: user.scope_id,
  };
}

export function enableTotp(userId: string, secret: string) {
  getDb().prepare("UPDATE users SET totp_secret = ?, totp_enabled = 1 WHERE id = ?").run(secret, userId);
}

export function disableTotp(userId: string) {
  getDb().prepare("UPDATE users SET totp_secret = NULL, totp_enabled = 0 WHERE id = ?").run(userId);
}

export type Scope = { role: Role; scopeType: SessionUser["scopeType"]; scopeId: string | null };

export function siteIdsForScope(scope: Scope): string[] | null {
  if (scope.role === "superadmin" || scope.role === "auditor" || scope.scopeType === "all") {
    return null;
  }
  if ((scope.role === "site_manager" || scope.role === "operator") && scope.scopeId) {
    return [scope.scopeId];
  }
  if (scope.role === "zone_manager" && scope.scopeId) {
    const rows = getDb()
      .prepare("SELECT id FROM sites WHERE zone_id = ?")
      .all(scope.scopeId) as Array<{ id: string }>;
    return rows.map((r) => r.id);
  }
  return [];
}

export function listEmployeesScoped(scope: Scope, includeDeleted = false) {
  const allowed = siteIdsForScope(scope);
  const all = listEmployees(undefined, { includeDeleted });
  if (!allowed) return all;
  return all.filter((e) => allowed.includes(e.siteId));
}

export function listSitesScoped(scope: Scope) {
  const allowed = siteIdsForScope(scope);
  const all = listSites();
  if (!allowed) return all;
  return all.filter((s) => allowed.includes(s.id));
}

export function verifyEmployeePin(employeeId: string, pin: string) {
  const row = getDb().prepare("SELECT pin_hash FROM employees WHERE id = ?").get(employeeId) as
    | { pin_hash: string | null }
    | undefined;
  if (!row?.pin_hash) return false;
  return verifyPassword(pin, row.pin_hash);
}

export function verifySupervisorPin(pin: string) {
  const hash = getSetting("supervisor_pin");
  if (!hash) return pin === supervisorPin();
  return verifyPassword(pin, hash);
}

export function setSupervisorPin(pin: string) {
  setSetting("supervisor_pin", hashPassword(pin));
}

export function insertEnrollmentAudit(input: {
  employeeId: string;
  operatorId?: string | null;
  operatorName?: string | null;
  userAgent?: string | null;
  siteId?: string | null;
  action: string;
}) {
  getDb()
    .prepare(
      `INSERT INTO enrollment_audit (id, employee_id, operator_id, operator_name, site_id, user_agent, created_at, action)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      ulid(),
      input.employeeId,
      input.operatorId ?? null,
      input.operatorName ?? null,
      input.siteId ?? null,
      input.userAgent ?? null,
      new Date().toISOString(),
      input.action,
    );
}

export function listEnrollmentAudit(employeeId?: string) {
  const db = getDb();
  if (employeeId) {
    return db
      .prepare("SELECT * FROM enrollment_audit WHERE employee_id = ? ORDER BY created_at DESC")
      .all(employeeId);
  }
  return db.prepare("SELECT * FROM enrollment_audit ORDER BY created_at DESC LIMIT 200").all();
}

export class CorrectionWindowError extends Error {}

export function insertCorrection(input: {
  punchId: string;
  reason: string;
  requestedBy: string;
  approvedBy: string;
  newTs?: string | null;
  newType?: string | null;
  force?: boolean;
}) {
  const db = getDb();
  const punch = db.prepare("SELECT * FROM punches WHERE id = ?").get(input.punchId) as
    | Record<string, unknown>
    | undefined;
  if (!punch) return null;
  const win = Number(getSetting("correction_window_hours") || "0");
  if (win > 0 && !input.force) {
    const ageMs = Date.now() - new Date(String(punch.captured_at)).getTime();
    if (ageMs > win * 3_600_000) {
      throw new CorrectionWindowError(
        `Plazo de corrección vencido: la marcación tiene más de ${win} h. Solo superadmin puede forzar.`,
      );
    }
  }
  const previous = {
    ts: punch.captured_at,
    type: punch.type,
  };
  const next = {
    ts: input.newTs ?? punch.captured_at,
    type: input.newType ?? punch.type,
  };
  const id = ulid();
  db.prepare(
    `INSERT INTO corrections (id, punch_id, reason, requested_by, approved_by, patch, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    input.punchId,
    input.reason,
    input.requestedBy,
    input.approvedBy,
    JSON.stringify({ previous, next }),
    new Date().toISOString(),
  );
  if (input.newTs || input.newType) {
    db.prepare("UPDATE punches SET captured_at = ?, type = ? WHERE id = ?").run(
      next.ts,
      next.type,
      input.punchId,
    );
  }
  recordEvent(db, "punch.corrected", {
    punchId: input.punchId,
    reason: input.reason,
    approvedBy: input.approvedBy,
  });
  return db.prepare("SELECT * FROM corrections WHERE id = ?").get(id);
}

export function listCorrections(punchId?: string) {
  const db = getDb();
  if (punchId) {
    return db.prepare("SELECT * FROM corrections WHERE punch_id = ? ORDER BY created_at DESC").all(punchId);
  }
  return db.prepare("SELECT * FROM corrections ORDER BY created_at DESC LIMIT 200").all();
}

export function listSchedules(employeeId?: string) {
  const db = getDb();
  if (employeeId) {
    return db.prepare("SELECT * FROM schedules WHERE employee_id = ? ORDER BY weekday").all(employeeId);
  }
  return db.prepare("SELECT * FROM schedules ORDER BY employee_id, weekday").all();
}

export function listShifts() {
  return getDb().prepare("SELECT * FROM shifts ORDER BY start_hm").all();
}

export function upsertShift(input: {
  id?: string;
  name: string;
  startHm: string;
  endHm: string;
  breakMin?: number;
}) {
  const db = getDb();
  if (input.id) {
    const r = db
      .prepare("UPDATE shifts SET name = ?, start_hm = ?, end_hm = ?, break_min = ? WHERE id = ?")
      .run(input.name, input.startHm, input.endHm, input.breakMin ?? 60, input.id);
    if (r.changes === 0) {
      db.prepare("INSERT INTO shifts (id, name, start_hm, end_hm, break_min) VALUES (?,?,?,?,?)").run(
        input.id,
        input.name,
        input.startHm,
        input.endHm,
        input.breakMin ?? 60,
      );
    }
    return input.id;
  }
  const id = ulid();
  db.prepare("INSERT INTO shifts (id, name, start_hm, end_hm, break_min) VALUES (?,?,?,?,?)").run(
    id,
    input.name,
    input.startHm,
    input.endHm,
    input.breakMin ?? 60,
  );
  return id;
}

export function listContracts(employeeId?: string) {
  const db = getDb();
  const sql = `SELECT c.*, e.name AS employee_name, e.code AS employee_code, e.site_id
    FROM contracts c JOIN employees e ON e.id = c.employee_id
    ${employeeId ? "WHERE c.employee_id = ?" : ""} ORDER BY e.name`;
  return employeeId ? db.prepare(sql).all(employeeId) : db.prepare(sql).all();
}

export function upsertContract(input: {
  employeeId: string;
  monthlySalary: number;
  weeklyHours: number;
  currency?: string;
}) {
  const db = getDb();
  const existing = db.prepare("SELECT id FROM contracts WHERE employee_id = ?").get(input.employeeId) as
    | { id: string }
    | undefined;
  if (existing) {
    db.prepare("UPDATE contracts SET monthly_salary = ?, weekly_hours = ?, currency = ? WHERE id = ?").run(
      input.monthlySalary,
      input.weeklyHours,
      input.currency ?? "COP",
      existing.id,
    );
    return existing.id;
  }
  const id = ulid();
  db.prepare(
    "INSERT INTO contracts (id, employee_id, monthly_salary, weekly_hours, currency) VALUES (?,?,?,?,?)",
  ).run(id, input.employeeId, input.monthlySalary, input.weeklyHours, input.currency ?? "COP");
  return id;
}

export function upsertSchedule(input: {
  employeeId: string;
  weekday: number;
  startHm?: string;
  endHm?: string;
  lateGraceMin?: number;
  shiftId?: string;
}) {
  let startHm = input.startHm;
  let endHm = input.endHm;
  if (input.shiftId) {
    const shift = getDb().prepare("SELECT * FROM shifts WHERE id = ?").get(input.shiftId) as
      | Record<string, unknown>
      | undefined;
    if (!shift) throw new Error("Turno no encontrado");
    startHm = String(shift.start_hm);
    endHm = String(shift.end_hm);
  }
  if (!startHm || !endHm) throw new Error("startHm y endHm son obligatorios (o un shiftId)");
  const db = getDb();
  const existing = db
    .prepare("SELECT id FROM schedules WHERE employee_id = ? AND weekday = ?")
    .get(input.employeeId, input.weekday) as { id: string } | undefined;
  if (existing) {
    db.prepare(
      "UPDATE schedules SET start_hm = ?, end_hm = ?, late_grace_min = ?, shift_id = ? WHERE id = ?",
    ).run(startHm, endHm, input.lateGraceMin ?? 10, input.shiftId ?? null, existing.id);
    return existing.id;
  }
  const id = ulid();
  db.prepare(
    "INSERT INTO schedules (id, employee_id, weekday, start_hm, end_hm, late_grace_min, shift_id) VALUES (?,?,?,?,?,?,?)",
  ).run(id, input.employeeId, input.weekday, startHm, endHm, input.lateGraceMin ?? 10, input.shiftId ?? null);
  return id;
}

export function listExceptions(employeeId?: string) {
  const db = getDb();
  if (employeeId) {
    return db.prepare("SELECT * FROM exceptions WHERE employee_id = ? ORDER BY date DESC").all(employeeId);
  }
  return db.prepare("SELECT * FROM exceptions ORDER BY date DESC").all();
}

export function insertException(input: {
  employeeId: string;
  date: string;
  type: string;
  reason: string;
  createdBy?: string;
}) {
  const id = ulid();
  getDb()
    .prepare(
      "INSERT INTO exceptions (id, employee_id, date, type, reason, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
    )
    .run(
      id,
      input.employeeId,
      input.date,
      input.type,
      input.reason,
      input.createdBy ?? null,
      new Date().toISOString(),
    );
  recordEvent(getDb(), "exception.created", { id, employeeId: input.employeeId, type: input.type });
  return getDb().prepare("SELECT * FROM exceptions WHERE id = ?").get(id);
}

export function listAlerts() {
  return getDb().prepare("SELECT * FROM alerts ORDER BY created_at DESC LIMIT 100").all();
}

export function insertAlert(type: string, message: string, siteId?: string | null, employeeId?: string | null) {
  const id = ulid();
  getDb()
    .prepare("INSERT INTO alerts (id, type, site_id, employee_id, message, created_at, acked) VALUES (?, ?, ?, ?, ?, ?, 0)")
    .run(id, type, siteId ?? null, employeeId ?? null, message, new Date().toISOString());
  recordEvent(getDb(), type, { id, message, siteId, employeeId });
  return id;
}

export function ackAlert(id: string) {
  getDb().prepare("UPDATE alerts SET acked = 1 WHERE id = ?").run(id);
}

export function incrementalsPunches(opts: {
  since?: string;
  afterId?: string;
  siteId?: string;
  limit?: number;
}): Punch[] {
  const limit = Math.min(opts.limit ?? 200, 1000);
  if (opts.afterId) {
    return listPunches({ siteId: opts.siteId, afterId: opts.afterId, limit, order: "asc" });
  }
  if (opts.since) {
    return listPunches({ siteId: opts.siteId, fromExclusive: opts.since, limit, order: "asc" });
  }
  return listPunches({ siteId: opts.siteId, limit });
}

export function retentionDays() {
  const n = Number(getSetting("retention_days") || "365");
  return Number.isFinite(n) ? n : 365;
}

export function applyRetention() {
  const days = retentionDays();
  const db = getDb();
  db.prepare(`DELETE FROM punches WHERE captured_at < datetime('now', ?)`).run(`-${days} days`);
  db.prepare(`DELETE FROM events WHERE created_at < datetime('now', ?)`).run(`-${days} days`);
  recordEvent(db, "retention.applied", { days });
}

function mapSchedule(row: Record<string, unknown>): Schedule {
  return {
    weekday: Number(row.weekday),
    startHm: String(row.start_hm),
    endHm: String(row.end_hm),
    lateGraceMin: Number(row.late_grace_min ?? 10),
  };
}

export function todayLocal() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TIMEZONE }).format(new Date());
}

/** Sedes de una región (país/zona) o null si no hay filtro — para filtrar punches/terminales/anomalías. */
export function siteIdsForRegion(countryId?: string, zoneId?: string): Set<string> | null {
  if (!countryId && !zoneId) return null;
  const sites = listSites().filter(
    (s) => (!countryId || s.countryId === countryId) && (!zoneId || s.zoneId === zoneId),
  );
  return new Set(sites.map((s) => s.id));
}

function employeesForFilters(input: {
  siteId?: string;
  employeeId?: string;
  countryId?: string;
  zoneId?: string;
  scope?: Scope;
}): Employee[] {
  const siteById = new Map(listSites().map((s) => [s.id, s]));
  let employees = (input.scope ? listEmployeesScoped(input.scope) : listEmployees(input.siteId)).filter(
    (e) => !input.employeeId || e.id === input.employeeId,
  );
  if (input.countryId) {
    employees = employees.filter((e) => siteById.get(e.siteId)?.countryId === input.countryId);
  }
  if (input.zoneId) {
    employees = employees.filter((e) => siteById.get(e.siteId)?.zoneId === input.zoneId);
  }
  return employees;
}

export function reportForDay(input: {
  day?: string;
  siteId?: string;
  employeeId?: string;
  status?: string;
  countryId?: string;
  zoneId?: string;
  scope?: Scope;
}) {
  const day = input.day || todayLocal();
  const { from, to } = dayBoundsUtc(day);
  const sites = listSites();
  const siteById = new Map(sites.map((s) => [s.id, s]));
  const employees = employeesForFilters(input);
  const punches = listPunches({
    siteId: input.siteId,
    from,
    to,
    limit: 500,
  });
  const schedules = listSchedules() as Array<Record<string, unknown>>;
  const exceptions = listExceptions() as Array<Record<string, unknown>>;
  const weekday = new Date(localNoon(day)).getDay();
  const rows = employees.map((employee) => {
    const schedRow = schedules.find(
      (s) => String(s.employee_id) === employee.id && Number(s.weekday) === weekday,
    );
    const exRow = exceptions.find(
      (x) => String(x.employee_id) === employee.id && String(x.date) === day,
    );
    const classified = classifyEmployee({
      employee,
      punches,
      schedule: schedRow ? mapSchedule(schedRow) : null,
      exception: exRow
        ? ({ date: String(exRow.date), type: String(exRow.type) } as Exception)
        : null,
      now: localNoon(day),
    });
    return {
      day,
      employee,
      status: classified.status,
      lateMin: classified.lateMin,
      lastPunch: classified.lastPunch,
    };
  });
  const filtered = input.status ? rows.filter((r) => r.status === input.status) : rows;
  return {
    day,
    totals: {
      present: rows.filter((r) => r.status === "present" || r.status === "on_time" || r.status === "late").length,
      absent: rows.filter((r) => r.status === "absent").length,
      late: rows.filter((r) => r.status === "late").length,
      earlyOut: rows.filter((r) => r.status === "early_out").length,
      omission: rows.filter((r) => r.status === "omission").length,
    },
    rows: filtered,
    terminals: listTerminals().filter((t) => {
      if (input.siteId && t.siteId !== input.siteId) return false;
      const site = siteById.get(t.siteId);
      if (input.countryId && site?.countryId !== input.countryId) return false;
      if (input.zoneId && site?.zoneId !== input.zoneId) return false;
      return true;
    }),
    filters: {
      day,
      siteId: input.siteId ?? null,
      countryId: input.countryId ?? null,
      zoneId: input.zoneId ?? null,
      employeeId: input.employeeId ?? null,
      status: input.status ?? null,
    },
  };
}

function payrollCfg(): PayCfg {
  const num = (k: string, d: number) => {
    const n = Number(getSetting(k));
    return Number.isFinite(n) && n > 0 ? n : d;
  };
  const hm = (k: string, d: string) => {
    const n = hmToMin(getSetting(k) || d);
    return Number.isFinite(n) ? n : hmToMin(d);
  };
  let holidays: string[] = [];
  try {
    holidays = JSON.parse(getSetting("holidays") || "[]");
  } catch {
    holidays = [];
  }
  return {
    holidays,
    nightStartMin: hm("night_start_hm", "19:00"),
    nightEndMin: hm("night_end_hm", "06:00"),
    multDay: num("ot_day_multiplier", 1.25),
    multNight: num("ot_night_multiplier", 1.75),
    multHoliday: num("ot_holiday_multiplier", 2.0),
  };
}

function punchesBetween(from: string, to: string): Punch[] {
  const out: Punch[] = [];
  let afterId: string | undefined;
  for (;;) {
    const batch = listPunches({ from, to, afterId, limit: 5000, order: "asc" });
    out.push(...batch);
    if (batch.length < 5000) break;
    afterId = batch.at(-1)?.id;
    if (!afterId) break;
  }
  return out;
}

type Punctual = {
  employee: { id: string; name: string; code: string; siteId: string };
  presentDays: number;
  lateDays: number;
  lateMin: number;
  avgLateMin: number;
  unjustified: number;
};

/** Dashboard mensual: serie diaria, KPIs de puntualidad y nómina de horas/valores. */
export function reportDashboard(input: {
  month?: string;
  siteId?: string;
  employeeId?: string;
  countryId?: string;
  zoneId?: string;
  scope?: Scope;
}) {
  const month = (input.month || todayLocal().slice(0, 7)).slice(0, 7);
  const days = daysOfMonth(month).filter((d) => d <= todayLocal());
  const exceptions = listExceptions() as Array<Record<string, unknown>>;
  const excSet = new Set(
    exceptions
      .filter((x) => x.type === "justified" || x.type === "off")
      .map((x) => `${x.employee_id}|${x.date}`),
  );

  // Serie diaria + agregación por trabajador (reusa reportForDay; O(días×empleados)).
  const series: Array<{ day: string; present: number; absent: number; late: number; earlyOut: number; omission: number }> = [];
  const perEmp = new Map<string, Punctual>();
  for (const day of days) {
    const r = reportForDay({
      day,
      siteId: input.siteId,
      employeeId: input.employeeId,
      countryId: input.countryId,
      zoneId: input.zoneId,
      scope: input.scope,
    });
    series.push({ day, ...r.totals });
    for (const row of r.rows) {
      let rec = perEmp.get(row.employee.id);
      if (!rec) {
        rec = {
          employee: {
            id: row.employee.id,
            name: row.employee.name,
            code: row.employee.code,
            siteId: row.employee.siteId,
          },
          presentDays: 0,
          lateDays: 0,
          lateMin: 0,
          avgLateMin: 0,
          unjustified: 0,
        };
        perEmp.set(row.employee.id, rec);
      }
      if (row.status === "present" || row.status === "on_time" || row.status === "late") {
        rec.presentDays += 1;
        if (row.status === "late") {
          rec.lateDays += 1;
          rec.lateMin += row.lateMin;
        }
      } else if (row.status === "absent") {
        if (!excSet.has(`${row.employee.id}|${day}`)) rec.unjustified += 1;
      }
    }
  }

  const eligible = [...perEmp.values()].filter((r) => r.presentDays > 0);
  for (const r of eligible) r.avgLateMin = Math.round((r.lateMin / r.presentDays) * 10) / 10;
  const byPunct = [...eligible].sort(
    (a, b) => a.avgLateMin - b.avgLateMin || a.lateDays - b.lateDays,
  );
  const siteAgg = new Map<string, { siteId: string; presentDays: number; lateMin: number; lateDays: number }>();
  for (const r of eligible) {
    const s = siteAgg.get(r.employee.siteId) ?? { siteId: r.employee.siteId, presentDays: 0, lateMin: 0, lateDays: 0 };
    s.presentDays += r.presentDays;
    s.lateMin += r.lateMin;
    s.lateDays += r.lateDays;
    siteAgg.set(r.employee.siteId, s);
  }
  const siteNames = new Map(listSites().map((s) => [s.id, s.name]));
  const sitesByPunct = [...siteAgg.values()]
    .map((s) => ({
      ...s,
      name: siteNames.get(s.siteId) ?? s.siteId,
      avgLateMin: Math.round((s.lateMin / s.presentDays) * 10) / 10,
    }))
    .sort((a, b) => a.avgLateMin - b.avgLateMin || a.lateDays - b.lateDays);

  // Nómina: horas y valores por trabajador.
  const employees = employeesForFilters(input);
  const [firstDay] = daysOfMonth(month);
  const lastDay = daysOfMonth(month).at(-1) ?? firstDay;
  const punches = punchesBetween(
    new Date(new Date(dayBoundsUtc(firstDay).from).getTime() - 86_400_000).toISOString(),
    dayBoundsUtc(lastDay).to,
  );
  const shifts = new Map(listShifts().map((s) => [String((s as Record<string, unknown>).id), s as Record<string, unknown>]));
  const contracts = new Map(
    listContracts().map((c) => [String((c as Record<string, unknown>).employee_id), c as Record<string, unknown>]),
  );
  const schedByEmp = new Map<string, Map<number, DaySchedule>>();
  for (const s of listSchedules() as Array<Record<string, unknown>>) {
    const shift = s.shift_id ? shifts.get(String(s.shift_id)) : undefined;
    const entry: DaySchedule = {
      startMin: hmToMin(String(s.start_hm)),
      endMin: hmToMin(String(s.end_hm)),
      breakMin: shift ? Number(shift.break_min ?? 0) : 0,
    };
    const m = schedByEmp.get(String(s.employee_id)) ?? new Map();
    m.set(Number(s.weekday), entry);
    schedByEmp.set(String(s.employee_id), m);
  }
  const cfg = payrollCfg();
  const payroll = employees.map((e) => {
    const contract = contracts.get(e.id);
    const empSched = schedByEmp.get(e.id);
    const summary = summarizeMonth({
      month,
      punches: punches.filter((p) => p.employeeId === e.id),
      scheduleFor: (day) => empSched?.get(new Date(localNoon(day)).getDay()) ?? null,
      contract: contract
        ? { monthlySalary: Number(contract.monthly_salary), weeklyHours: Number(contract.weekly_hours) }
        : null,
      cfg,
    });
    return {
      employeeId: e.id,
      name: e.name,
      code: e.code,
      siteId: e.siteId,
      siteName: siteNames.get(e.siteId) ?? e.siteId,
      hasContract: Boolean(contract),
      currency: String(contract?.currency ?? "COP"),
      ...summary,
    };
  });

  // Alertas contractuales (dedupe: sin acuse previo del mismo tipo+empleado).
  const maxWeekly = Number(getSetting("max_weekly_hours") || "0");
  const absThreshold = Number(getSetting("unjustified_absence_alert") || "0");
  const existing = listAlerts() as Array<{ type: string; employee_id: string | null; acked: number }>;
  const hasAlert = (type: string, empId: string) =>
    existing.some((a) => a.type === type && a.employee_id === empId && a.acked === 0);
  if (maxWeekly > 0) {
    for (const row of payroll) {
      const over = Object.entries(row.weeklyHours).find(([, h]) => Number(h) > maxWeekly);
      if (over && !hasAlert("hours.over_limit", row.employeeId)) {
        insertAlert(
          "hours.over_limit",
          `${row.name}: ${Math.round(Number(over[1]))} h en la semana del ${over[0]} (máx. legal ${maxWeekly} h)`,
          row.siteId,
          row.employeeId,
        );
      }
    }
  }
  if (absThreshold > 0) {
    for (const rec of eligible) {
      if (rec.unjustified >= absThreshold && !hasAlert("absence.unjustified", rec.employee.id)) {
        insertAlert(
          "absence.unjustified",
          `${rec.employee.name}: ${rec.unjustified} faltas injustificadas en ${month} (umbral contractual ${absThreshold})`,
          rec.employee.siteId,
          rec.employee.id,
        );
      }
    }
  }

  const totals = series.reduce(
    (acc, s) => ({
      present: acc.present + s.present,
      absent: acc.absent + s.absent,
      late: acc.late + s.late,
      earlyOut: acc.earlyOut + s.earlyOut,
      omission: acc.omission + s.omission,
    }),
    { present: 0, absent: 0, late: 0, earlyOut: 0, omission: 0 },
  );
  return {
    month,
    days: days.length,
    totals,
    series,
    kpis: {
      mostPunctual: byPunct[0] ?? null,
      leastPunctual: byPunct.at(-1) ?? null,
      mostPunctualSite: sitesByPunct[0] ?? null,
    },
    payroll,
    params: {
      maxWeeklyHours: maxWeekly,
      absenceThreshold: absThreshold,
      correctionWindowHours: Number(getSetting("correction_window_hours") || "0"),
      multipliers: { day: cfg.multDay, night: cfg.multNight, holiday: cfg.multHoliday },
    },
  };
}

export async function sendMonthlyReport(month?: string) {
  const url = getSetting("monthly_report_endpoint");
  if (!url) return { ok: false, error: "Sin endpoint configurado" };
  const m = (month || todayLocal().slice(0, 7)).slice(0, 7);
  try {
    const payload = reportDashboard({ month: m });
    const res = await postSigned(url, "report.monthly", payload);
    if (res.ok) {
      setSetting("monthly_report_last_sent", m);
      recordEvent(getDb(), "report.monthly_sent", { month: m, status: res.status });
    }
    return { ok: res.ok, status: res.status, month: m };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Fallo de red", month: m };
  }
}

export function ensureOfflineAlerts() {
  if (getSetting("alert_terminal_offline") === "0") return;
  const terminals = listTerminals();
  const existing = listAlerts() as Array<{ type: string; site_id: string | null; acked: number; created_at: string }>;
  const now = Date.now();
  for (const terminal of terminals) {
    if (terminal.online) continue;
    const recent = existing.find(
      (a) =>
        a.type === "terminal.offline" &&
        a.site_id === terminal.siteId &&
        a.acked === 0 &&
        now - new Date(a.created_at).getTime() < 30 * 60_000,
    );
    if (!recent) {
      insertAlert(
        "terminal.offline",
        `Terminal ${terminal.label} sin latido (${terminal.id})`,
        terminal.siteId,
      );
    }
  }
}

export function dumpMasters() {
  const db = getDb();
  return {
    countries: listCountries(),
    zones: listZones(),
    sites: listSites(),
    employees: listEmployees(undefined, { includeDeleted: true }),
    users: listUsersPublic(),
    schedules: listSchedules(),
    exceptions: listExceptions(),
    settings: Object.fromEntries(
      Object.entries(listSettings()).filter(([k]) => k !== "supervisor_pin"),
    ),
    enrollmentAudit: listEnrollmentAudit(),
    corrections: listCorrections(),
    alerts: listAlerts(),
    events: db.prepare("SELECT * FROM events ORDER BY created_at DESC LIMIT 2000").all(),
    punches: listPunches({ limit: 5000 }),
    terminals: listTerminals(),
    anomalies: getDb().prepare("SELECT * FROM anomalies ORDER BY created_at DESC LIMIT 500").all(),
  };
}
