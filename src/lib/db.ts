import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { ulid } from "ulidx";
import { TERMINAL_ONLINE_MS } from "@/lib/config";
import { dispatchWebhook } from "@/lib/webhook";
import type {
  AttendanceRow,
  Employee,
  FaceTemplate,
  Punch,
  PunchDecision,
  PunchType,
  Site,
  SyncItem,
  Terminal,
} from "@/lib/types";

const dataDir = process.env.DATA_DIR || path.join(process.cwd(), "data");
fs.mkdirSync(dataDir, { recursive: true });

const globalForDb = globalThis as unknown as {
  __bioDb?: Database.Database;
};

function createDb() {
  const db = new Database(path.join(dataDir, "asistencia.db"));
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  migrate(db);
  seed(db);
  return db;
}

export function getDb() {
  if (!globalForDb.__bioDb) {
    globalForDb.__bioDb = createDb();
  }
  return globalForDb.__bioDb;
}

function migrate(db: Database.Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS sites (
      id TEXT PRIMARY KEY,
      code TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      city TEXT NOT NULL,
      timezone TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS employees (
      id TEXT PRIMARY KEY,
      code TEXT NOT NULL,
      name TEXT NOT NULL,
      site_id TEXT NOT NULL,
      role TEXT NOT NULL,
      active INTEGER NOT NULL DEFAULT 1,
      consent_at TEXT,
      created_at TEXT NOT NULL,
      UNIQUE(code, site_id),
      FOREIGN KEY (site_id) REFERENCES sites(id)
    );

    CREATE TABLE IF NOT EXISTS face_templates (
      id TEXT PRIMARY KEY,
      employee_id TEXT NOT NULL,
      descriptor TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (employee_id) REFERENCES employees(id)
    );

    CREATE TABLE IF NOT EXISTS punches (
      id TEXT PRIMARY KEY,
      employee_id TEXT,
      site_id TEXT NOT NULL,
      type TEXT NOT NULL,
      captured_at TEXT NOT NULL,
      received_at TEXT NOT NULL,
      terminal_id TEXT NOT NULL,
      match_score REAL,
      decision TEXT NOT NULL,
      offline INTEGER NOT NULL DEFAULT 0,
      liveness_hint TEXT NOT NULL DEFAULT 'skipped',
      FOREIGN KEY (site_id) REFERENCES sites(id)
    );

    CREATE TABLE IF NOT EXISTS terminals (
      id TEXT PRIMARY KEY,
      site_id TEXT NOT NULL,
      label TEXT NOT NULL,
      last_seen TEXT NOT NULL,
      user_agent TEXT NOT NULL,
      path TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS events (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      payload TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
  `);
}

function seed(db: Database.Database) {
  const count = db.prepare("SELECT COUNT(*) as n FROM sites").get() as { n: number };
  if (count.n > 0) return;

  const now = new Date().toISOString();

  const sites: Site[] = [
    {
      id: "site_r01",
      code: "R01",
      name: "Soda El Parque",
      city: "San José",
      timezone: "America/Costa_Rica",
    },
    {
      id: "site_r02",
      code: "R02",
      name: "Mariscos del Caribe",
      city: "Limón",
      timezone: "America/Costa_Rica",
    },
  ];

  const insertSite = db.prepare(
    "INSERT INTO sites (id, code, name, city, timezone) VALUES (?, ?, ?, ?, ?)",
  );
  for (const site of sites) {
    insertSite.run(site.id, site.code, site.name, site.city, site.timezone);
  }

  const employees = [
    {
      id: "emp_maria",
      code: "MES-014",
      name: "María Solís",
      siteId: "site_r01",
      role: "Mesera",
    },
    {
      id: "emp_carlos",
      code: "COC-003",
      name: "Carlos Méndez",
      siteId: "site_r01",
      role: "Cocinero",
    },
    {
      id: "emp_ana",
      code: "CAJ-001",
      name: "Ana Vargas",
      siteId: "site_r01",
      role: "Cajera",
    },
    {
      id: "emp_luis",
      code: "MES-021",
      name: "Luis Herrera",
      siteId: "site_r02",
      role: "Mesero",
    },
    {
      id: "emp_sofia",
      code: "COC-008",
      name: "Sofía Jiménez",
      siteId: "site_r02",
      role: "Cocinera",
    },
  ];

  const insertEmp = db.prepare(
    `INSERT INTO employees (id, code, name, site_id, role, active, consent_at, created_at)
     VALUES (?, ?, ?, ?, ?, 1, NULL, ?)`,
  );
  for (const emp of employees) {
    insertEmp.run(emp.id, emp.code, emp.name, emp.siteId, emp.role, now);
  }

  recordEvent(db, "seed.completed", {
    sites: sites.length,
    employees: employees.length,
  });
}

function recordEvent(db: Database.Database, type: string, payload: unknown) {
  db.prepare(
    "INSERT INTO events (id, type, payload, created_at) VALUES (?, ?, ?, ?)",
  ).run(ulid(), type, JSON.stringify(payload), new Date().toISOString());
  dispatchWebhook(type, payload);
}

function mapEmployee(row: Record<string, unknown>): Employee {
  return {
    id: String(row.id),
    code: String(row.code),
    name: String(row.name),
    siteId: String(row.site_id),
    role: String(row.role),
    active: Boolean(row.active),
    consentAt: row.consent_at ? String(row.consent_at) : null,
    enrolled: Number(row.template_count || 0) > 0,
    templateCount: Number(row.template_count || 0),
  };
}

function mapPunch(row: Record<string, unknown>): Punch {
  return {
    id: String(row.id),
    employeeId: row.employee_id ? String(row.employee_id) : null,
    employeeName: row.employee_name ? String(row.employee_name) : null,
    employeeCode: row.employee_code ? String(row.employee_code) : null,
    siteId: String(row.site_id),
    type: row.type as PunchType,
    capturedAt: String(row.captured_at),
    receivedAt: String(row.received_at),
    terminalId: String(row.terminal_id),
    matchScore: row.match_score == null ? null : Number(row.match_score),
    decision: row.decision as PunchDecision,
    offline: Boolean(row.offline),
    livenessHint: (row.liveness_hint as Punch["livenessHint"]) || "skipped",
  };
}

const EMPLOYEE_SELECT = `
  SELECT e.*,
    (SELECT COUNT(*) FROM face_templates t WHERE t.employee_id = e.id) AS template_count
  FROM employees e
`;

const PUNCH_SELECT = `
  SELECT p.*, e.name AS employee_name, e.code AS employee_code
  FROM punches p
  LEFT JOIN employees e ON e.id = p.employee_id
`;

export function listSites(): Site[] {
  return getDb()
    .prepare("SELECT * FROM sites ORDER BY code")
    .all() as Site[];
}

export function getSiteByCode(code: string): Site | undefined {
  return getDb()
    .prepare("SELECT * FROM sites WHERE code = ? OR id = ?")
    .get(code, code) as Site | undefined;
}

export function listEmployees(siteId?: string): Employee[] {
  const sql = siteId
    ? `${EMPLOYEE_SELECT} WHERE e.site_id = ? OR e.site_id = (SELECT id FROM sites WHERE code = ?) ORDER BY e.name`
    : `${EMPLOYEE_SELECT} ORDER BY e.name`;
  const rows = siteId
    ? (getDb().prepare(sql).all(siteId, siteId) as Record<string, unknown>[])
    : (getDb().prepare(sql).all() as Record<string, unknown>[]);
  return rows.map(mapEmployee);
}

export function getEmployee(id: string): Employee | undefined {
  const row = getDb()
    .prepare(`${EMPLOYEE_SELECT} WHERE e.id = ? OR e.code = ?`)
    .get(id, id) as Record<string, unknown> | undefined;
  return row ? mapEmployee(row) : undefined;
}

export function createEmployee(input: {
  name: string;
  code: string;
  siteId: string;
  role?: string;
  consentAt?: string | null;
}): Employee {
  const site = getSiteByCode(input.siteId);
  if (!site) throw new Error("Sede no encontrada");
  const id = ulid();
  getDb()
    .prepare(
      `INSERT INTO employees (id, code, name, site_id, role, active, consent_at, created_at)
       VALUES (?, ?, ?, ?, ?, 1, ?, ?)`,
    )
    .run(
      id,
      input.code.trim().toUpperCase(),
      input.name.trim(),
      site.id,
      input.role?.trim() || "Colaborador",
      input.consentAt ?? null,
      new Date().toISOString(),
    );
  recordEvent(getDb(), "employee.created", { id, code: input.code, siteId: site.id });
  return getEmployee(id)!;
}

export function setEmployeeConsent(id: string, consentAt: string) {
  getDb()
    .prepare("UPDATE employees SET consent_at = ? WHERE id = ?")
    .run(consentAt, id);
}

export function patchEmployee(
  id: string,
  patch: { active?: boolean; revokeConsent?: boolean },
) {
  const current = getEmployee(id);
  if (!current) throw new Error("Colaborador no encontrado");
  if (patch.active !== undefined) {
    getDb()
      .prepare("UPDATE employees SET active = ? WHERE id = ?")
      .run(patch.active ? 1 : 0, id);
    recordEvent(getDb(), "employee.updated", { id, active: patch.active });
  }
  if (patch.revokeConsent) {
    getDb().prepare("UPDATE employees SET consent_at = NULL WHERE id = ?").run(id);
    getDb().prepare("DELETE FROM face_templates WHERE employee_id = ?").run(id);
    recordEvent(getDb(), "consent.revoked", { id });
  }
  return getEmployee(id)!;
}

export function wipeTemplates(employeeId: string) {
  if (!getEmployee(employeeId)) throw new Error("Colaborador no encontrado");
  getDb().prepare("DELETE FROM face_templates WHERE employee_id = ?").run(employeeId);
  recordEvent(getDb(), "template.wiped", { employeeId });
}

export function listTemplates(siteId?: string): FaceTemplate[] {
  const sql = siteId
    ? `SELECT t.* FROM face_templates t
       JOIN employees e ON e.id = t.employee_id
       WHERE e.site_id = ? OR e.site_id = (SELECT id FROM sites WHERE code = ?)`
    : "SELECT * FROM face_templates";
  const rows = siteId
    ? (getDb().prepare(sql).all(siteId, siteId) as Record<string, unknown>[])
    : (getDb().prepare(sql).all() as Record<string, unknown>[]);
  return rows.map((row) => ({
    id: String(row.id),
    employeeId: String(row.employee_id),
    descriptor: JSON.parse(String(row.descriptor)) as number[],
    createdAt: String(row.created_at),
  }));
}

export function addTemplates(employeeId: string, descriptors: number[][]) {
  const emp = getEmployee(employeeId);
  if (!emp) throw new Error("Colaborador no encontrado");
  const insert = getDb().prepare(
    "INSERT INTO face_templates (id, employee_id, descriptor, created_at) VALUES (?, ?, ?, ?)",
  );
  const now = new Date().toISOString();
  const tx = getDb().transaction(() => {
    for (const descriptor of descriptors) {
      insert.run(ulid(), employeeId, JSON.stringify(descriptor), now);
    }
  });
  tx();
  recordEvent(getDb(), "template.enrolled", {
    employeeId,
    count: descriptors.length,
  });
}

export function upsertPunch(input: SyncItem & { offline?: boolean }): {
  punch: Punch;
  created: boolean;
} {
  const existing = getDb()
    .prepare(`${PUNCH_SELECT} WHERE p.id = ?`)
    .get(input.id) as Record<string, unknown> | undefined;
  if (existing) {
    return { punch: mapPunch(existing), created: false };
  }

  const site = getSiteByCode(input.siteId);
  if (!site) throw new Error("Sede no encontrada");

  const receivedAt = new Date().toISOString();
  getDb()
    .prepare(
      `INSERT INTO punches (
        id, employee_id, site_id, type, captured_at, received_at,
        terminal_id, match_score, decision, offline, liveness_hint
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      input.id,
      input.employeeId,
      site.id,
      input.type,
      input.capturedAt,
      receivedAt,
      input.terminalId,
      input.matchScore,
      input.decision,
      input.offline ? 1 : 0,
      input.livenessHint,
    );
  recordEvent(getDb(), "punch.recorded", {
    id: input.id,
    siteId: site.id,
    decision: input.decision,
    offline: Boolean(input.offline),
  });
  const row = getDb()
    .prepare(`${PUNCH_SELECT} WHERE p.id = ?`)
    .get(input.id) as Record<string, unknown>;
  return { punch: mapPunch(row), created: true };
}

export function recentDuplicate(input: {
  employeeId: string;
  type: PunchType;
  capturedAt: string;
  cooldownMs: number;
}): Punch | undefined {
  const row = getDb()
    .prepare(
      `${PUNCH_SELECT}
       WHERE p.employee_id = ? AND p.type = ? AND p.decision = 'matched'
       ORDER BY p.captured_at DESC LIMIT 1`,
    )
    .get(input.employeeId, input.type) as Record<string, unknown> | undefined;
  if (!row) return undefined;
  const last = mapPunch(row);
  const delta =
    new Date(input.capturedAt).getTime() - new Date(last.capturedAt).getTime();
  if (delta >= 0 && delta < input.cooldownMs) return last;
  return undefined;
}

export function listPunches(filters: {
  siteId?: string;
  from?: string;
  to?: string;
  limit?: number;
}): Punch[] {
  const clauses: string[] = [];
  const params: unknown[] = [];
  if (filters.siteId) {
    clauses.push(
      "(p.site_id = ? OR p.site_id = (SELECT id FROM sites WHERE code = ?))",
    );
    params.push(filters.siteId, filters.siteId);
  }
  if (filters.from) {
    clauses.push("p.captured_at >= ?");
    params.push(filters.from);
  }
  if (filters.to) {
    clauses.push("p.captured_at <= ?");
    params.push(filters.to);
  }
  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  const limit = Math.min(filters.limit ?? 200, 500);
  const rows = getDb()
    .prepare(
      `${PUNCH_SELECT} ${where} ORDER BY p.captured_at DESC LIMIT ?`,
    )
    .all(...params, limit) as Record<string, unknown>[];
  return rows.map(mapPunch);
}

export function todayBounds(timezone = "America/Costa_Rica") {
  const now = new Date();
  const local = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
  const start = new Date(`${local}T00:00:00-06:00`).toISOString();
  const end = new Date(`${local}T23:59:59.999-06:00`).toISOString();
  return { start, end, localDate: local };
}

export function attendanceToday(siteId?: string): AttendanceRow[] {
  const { start, end } = todayBounds();
  const employees = listEmployees(siteId);
  const punches = listPunches({ siteId, from: start, to: end, limit: 500 });
  return employees.map((employee) => {
    const mine = punches.filter((p) => p.employeeId === employee.id);
    const last = mine[0] ?? null;
    const lastIn = mine.find((p) => p.type === "IN" && p.decision === "matched");
    const lastOut = mine.find((p) => p.type === "OUT" && p.decision === "matched");
    const present = Boolean(
      lastIn &&
        (!lastOut ||
          new Date(lastIn.capturedAt).getTime() >
            new Date(lastOut.capturedAt).getTime()),
    );
    return {
      employee,
      status: present ? "present" : "absent",
      lastPunch: last,
    };
  });
}

export function heartbeat(input: {
  id: string;
  siteId: string;
  label?: string;
  userAgent: string;
  path: string;
}) {
  const site = getSiteByCode(input.siteId);
  if (!site) throw new Error("Sede no encontrada");
  const now = new Date().toISOString();
  getDb()
    .prepare(
      `INSERT INTO terminals (id, site_id, label, last_seen, user_agent, path)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         site_id = excluded.site_id,
         label = excluded.label,
         last_seen = excluded.last_seen,
         user_agent = excluded.user_agent,
         path = excluded.path`,
    )
    .run(
      input.id,
      site.id,
      input.label || `Kiosco ${site.code}`,
      now,
      input.userAgent,
      input.path,
    );
}

export function listTerminals(): Terminal[] {
  const rows = getDb()
    .prepare("SELECT * FROM terminals ORDER BY last_seen DESC")
    .all() as Record<string, unknown>[];
  const now = Date.now();
  return rows.map((row) => ({
    id: String(row.id),
    siteId: String(row.site_id),
    label: String(row.label),
    lastSeen: String(row.last_seen),
    userAgent: String(row.user_agent),
    path: String(row.path),
    online: now - new Date(String(row.last_seen)).getTime() < TERMINAL_ONLINE_MS,
  }));
}

export function listEvents(limit = 50) {
  return getDb()
    .prepare("SELECT * FROM events ORDER BY created_at DESC LIMIT ?")
    .all(limit) as Array<{
    id: string;
    type: string;
    payload: string;
    created_at: string;
  }>;
}

export function statsToday(siteId?: string) {
  const rows = attendanceToday(siteId);
  const punches = listPunches({
    siteId,
    from: todayBounds().start,
    to: todayBounds().end,
    limit: 500,
  });
  return {
    present: rows.filter((r) => r.status === "present").length,
    absent: rows.filter((r) => r.status === "absent").length,
    enrolled: rows.filter((r) => r.employee.enrolled).length,
    punches: punches.length,
    unknown: punches.filter((p) => p.decision === "unknown").length,
  };
}
