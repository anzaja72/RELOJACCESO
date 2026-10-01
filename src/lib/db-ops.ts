import { ulid } from "ulidx";
import { classifyEmployee, type Exception, type Schedule } from "@/lib/attendance-rules";
import { getDb, listEmployees, listPunches, listSites, listTerminals, recordEvent } from "@/lib/db";
import { supervisorPin } from "@/lib/secrets";
import { verifyChain, type ChainRow } from "@/lib/integrity";
import { DEFAULT_RULES, type LaborRules } from "@/lib/labor";
import { hashPassword, verifyPassword, type Role, type SessionUser } from "@/lib/session";
import type { Employee, Punch } from "@/lib/types";
import { TIMEZONE, dayBoundsUtc, localNoon } from "@/lib/config";

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

export function insertCorrection(input: {
  punchId: string;
  reason: string;
  requestedBy: string;
  approvedBy: string;
  newTs?: string | null;
  newType?: string | null;
}) {
  const db = getDb();
  const punch = db.prepare("SELECT * FROM punches WHERE id = ?").get(input.punchId) as
    | Record<string, unknown>
    | undefined;
  if (!punch) return null;
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
    previous,
    next,
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

export function upsertSchedule(input: {
  employeeId: string;
  weekday: number;
  startHm: string;
  endHm: string;
  lateGraceMin?: number;
}) {
  const existing = getDb()
    .prepare("SELECT id FROM schedules WHERE employee_id = ? AND weekday = ?")
    .get(input.employeeId, input.weekday) as { id: string } | undefined;
  if (existing) {
    getDb()
      .prepare("UPDATE schedules SET start_hm = ?, end_hm = ?, late_grace_min = ? WHERE id = ?")
      .run(input.startHm, input.endHm, input.lateGraceMin ?? 10, existing.id);
    return existing.id;
  }
  const id = ulid();
  getDb()
    .prepare(
      "INSERT INTO schedules (id, employee_id, weekday, start_hm, end_hm, late_grace_min) VALUES (?, ?, ?, ?, ?, ?)",
    )
    .run(id, input.employeeId, input.weekday, input.startHm, input.endHm, input.lateGraceMin ?? 10);
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
  let employees = (input.scope ? listEmployeesScoped(input.scope) : listEmployees(input.siteId)).filter(
    (e) => !input.employeeId || e.id === input.employeeId,
  );
  if (input.countryId) {
    employees = employees.filter((e) => siteById.get(e.siteId)?.countryId === input.countryId);
  }
  if (input.zoneId) {
    employees = employees.filter((e) => siteById.get(e.siteId)?.zoneId === input.zoneId);
  }
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

/** Límites de jornada: configurables en settings, con los valores por defecto de labor.ts. */
export function laborRules(): LaborRules {
  const num = (key: string, fallback: number) => {
    const n = Number(getSetting(key));
    return Number.isFinite(n) && n > 0 ? n : fallback;
  };
  return {
    maxDailyHours: num("labor_max_daily_hours", DEFAULT_RULES.maxDailyHours),
    maxWeeklyHours: num("labor_max_weekly_hours", DEFAULT_RULES.maxWeeklyHours),
    restEveryDays: DEFAULT_RULES.restEveryDays,
  };
}

type Expected = { employeeId: string | null; type: string; capturedAt: string; terminalId: string };
export type PunchMismatch = { id: string; problem: "modified" | "missing"; detail: string };

/**
 * ¿Los registros siguen siendo los que se sellaron? Verifica la cadena de hashes
 * de los eventos y coteja cada marca contra lo que dijo su evento (más las
 * correcciones aprobadas), de modo que un UPDATE o DELETE directo a la base se note.
 */
export function integrityReport() {
  const db = getDb();
  const events = db
    .prepare("SELECT id, type, payload, created_at, prev_hash, hash FROM events ORDER BY rowid")
    .all() as ChainRow[];
  const chain = verifyChain(events);

  const expected = new Map<string, Expected>();
  for (const e of events) {
    if (e.type !== "punch.created" && e.type !== "punch.corrected") continue;
    const p = JSON.parse(e.payload) as Record<string, unknown> & {
      previous?: unknown;
      next?: { ts: string; type: string };
    };
    if (e.type === "punch.created" && typeof p.capturedAt === "string") {
      expected.set(String(p.id), {
        employeeId: (p.employeeId as string | null) ?? null,
        type: String(p.type),
        capturedAt: p.capturedAt,
        terminalId: String(p.terminalId),
      });
    } else if (e.type === "punch.corrected" && p.next) {
      const cur = expected.get(String(p.punchId));
      if (cur) expected.set(String(p.punchId), { ...cur, capturedAt: p.next.ts, type: p.next.type });
    }
  }

  const rows = db
    .prepare("SELECT id, employee_id, type, captured_at, terminal_id FROM punches")
    .all() as Array<{ id: string; employee_id: string | null; type: string; captured_at: string; terminal_id: string }>;
  const mismatches: PunchMismatch[] = [];
  const seen = new Set<string>();
  let uncovered = 0;
  for (const r of rows) {
    seen.add(r.id);
    const exp = expected.get(r.id);
    if (!exp) {
      uncovered += 1;
      continue;
    }
    const diffs: string[] = [];
    if (r.employee_id !== exp.employeeId) diffs.push("colaborador");
    if (r.type !== exp.type) diffs.push("tipo");
    if (r.captured_at !== exp.capturedAt) diffs.push("fecha/hora");
    if (r.terminal_id !== exp.terminalId) diffs.push("terminal");
    if (diffs.length) mismatches.push({ id: r.id, problem: "modified", detail: `Difiere: ${diffs.join(", ")}` });
  }
  // La retención borra marcas viejas a propósito: solo cuenta como faltante lo posterior al corte.
  const cutoff = new Date(Date.now() - retentionDays() * 86_400_000).toISOString();
  for (const [id, exp] of expected) {
    if (!seen.has(id) && exp.capturedAt >= cutoff) {
      mismatches.push({ id, problem: "missing", detail: "La marca existe en el registro sellado pero ya no está en la base" });
    }
  }
  return {
    chain,
    chainSince: getSetting("integrity_chain_since"),
    head: events.length ? events[events.length - 1].hash : null,
    punches: { checked: rows.length - uncovered, uncovered, mismatches },
    ok: chain.ok && mismatches.length === 0,
  };
}
