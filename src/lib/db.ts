import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { ulid } from "ulidx";
import { TERMINAL_ONLINE_MS, TIMEZONE, UTC_OFFSET } from "@/lib/config";
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

import { openJson, sealJson } from "@/lib/crypto-box";
import { adminPassword, supervisorPin } from "@/lib/secrets";
import { GENESIS_HASH, chainHash } from "@/lib/integrity";
import { hashPassword } from "@/lib/session";

const dataDir = process.env.DATA_DIR || path.join(process.cwd(), "data");
fs.mkdirSync(dataDir, { recursive: true });
const dbFile =
  process.env.SANDBOX === "true" ? "asistencia.sandbox.db" : "asistencia.db";

const globalForDb = globalThis as unknown as {
  __bioDb?: Database.Database;
  __bioV3?: boolean;
};

function createDb() {
  const db = new Database(path.join(dataDir, dbFile));
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  migrate(db);
  seed(db);
  migrateV2(db);
  migrateV3(db);
  return db;
}

export function getDb() {
  if (!globalForDb.__bioDb) {
    globalForDb.__bioDb = createDb();
  } else if (!globalForDb.__bioV3) {
    migrateV3(globalForDb.__bioDb);
    globalForDb.__bioV3 = true;
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
      name: "Restaurante La Candelaria",
      city: "Bogotá",
      timezone: TIMEZONE,
    },
    {
      id: "site_r02",
      code: "R02",
      name: "Mariscos del Caribe",
      city: "Barranquilla",
      timezone: TIMEZONE,
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

function hasColumn(db: Database.Database, table: string, name: string) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
  return cols.some((c) => c.name === name);
}

function migrateV2(db: Database.Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS countries (
      id TEXT PRIMARY KEY, code TEXT UNIQUE NOT NULL, name TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS zones (
      id TEXT PRIMARY KEY, country_id TEXT NOT NULL, code TEXT NOT NULL, name TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      role TEXT NOT NULL,
      scope_type TEXT NOT NULL,
      scope_id TEXT,
      password_hash TEXT NOT NULL,
      totp_secret TEXT,
      totp_enabled INTEGER NOT NULL DEFAULT 0,
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS schedules (
      id TEXT PRIMARY KEY,
      employee_id TEXT NOT NULL,
      weekday INTEGER NOT NULL,
      start_hm TEXT NOT NULL,
      end_hm TEXT NOT NULL,
      late_grace_min INTEGER NOT NULL DEFAULT 10
    );
    CREATE TABLE IF NOT EXISTS exceptions (
      id TEXT PRIMARY KEY,
      employee_id TEXT NOT NULL,
      date TEXT NOT NULL,
      type TEXT NOT NULL,
      reason TEXT NOT NULL,
      created_by TEXT,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS corrections (
      id TEXT PRIMARY KEY,
      punch_id TEXT NOT NULL,
      reason TEXT NOT NULL,
      requested_by TEXT NOT NULL,
      approved_by TEXT NOT NULL,
      patch TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS alerts (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      site_id TEXT,
      employee_id TEXT,
      message TEXT NOT NULL,
      created_at TEXT NOT NULL,
      acked INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS enrollment_audit (
      id TEXT PRIMARY KEY,
      employee_id TEXT NOT NULL,
      operator_id TEXT,
      operator_name TEXT,
      site_id TEXT,
      user_agent TEXT,
      created_at TEXT NOT NULL
    );
  `);
  if (!hasColumn(db, "sites", "country_id")) {
    db.exec("ALTER TABLE sites ADD COLUMN country_id TEXT");
    db.exec("ALTER TABLE sites ADD COLUMN zone_id TEXT");
  }
  if (!hasColumn(db, "employees", "deleted_at")) {
    db.exec("ALTER TABLE employees ADD COLUMN deleted_at TEXT");
    db.exec("ALTER TABLE employees ADD COLUMN pin_hash TEXT");
  }
  if (!hasColumn(db, "punches", "method")) {
    db.exec("ALTER TABLE punches ADD COLUMN method TEXT DEFAULT 'face'");
    db.exec("ALTER TABLE punches ADD COLUMN event_type TEXT DEFAULT 'IN'");
    db.exec("ALTER TABLE punches ADD COLUMN supervisor_id TEXT");
    db.exec("ALTER TABLE punches ADD COLUMN reason TEXT");
    db.exec("ALTER TABLE punches ADD COLUMN novelty TEXT");
  }

  const country = db.prepare("SELECT COUNT(*) as n FROM countries").get() as { n: number };
  if (country.n === 0) {
    db.prepare("INSERT INTO countries (id, code, name) VALUES (?,?,?)").run(
      "cty_co",
      "CO",
      "Colombia",
    );
    db.prepare("INSERT INTO zones (id, country_id, code, name) VALUES (?,?,?,?)").run(
      "zone_andina",
      "cty_co",
      "AND",
      "Región Andina",
    );
    db.prepare("INSERT INTO zones (id, country_id, code, name) VALUES (?,?,?,?)").run(
      "zone_caribe",
      "cty_co",
      "CAR",
      "Región Caribe",
    );
    db.prepare("UPDATE sites SET country_id=?, zone_id=? WHERE id=?").run(
      "cty_co",
      "zone_andina",
      "site_r01",
    );
    db.prepare("UPDATE sites SET country_id=?, zone_id=? WHERE id=?").run(
      "cty_co",
      "zone_caribe",
      "site_r02",
    );
  }

  const users = db.prepare("SELECT COUNT(*) as n FROM users").get() as { n: number };
  if (users.n === 0) {
    const now = new Date().toISOString();
    const pass = hashPassword(adminPassword());
    const insert = db.prepare(
      `INSERT INTO users (id,email,name,role,scope_type,scope_id,password_hash,totp_secret,totp_enabled,active,created_at)
       VALUES (?,?,?,?,?,?,?,?,0,1,?)`,
    );
    insert.run("usr_admin", "admin@reloj.cr", "Superadmin", "superadmin", "all", null, pass, null, now);
    insert.run("usr_zona", "zona@reloj.cr", "Gerente Región Andina", "zone_manager", "zone", "zone_andina", pass, null, now);
    insert.run("usr_sede", "sede@reloj.cr", "Gerente R01", "site_manager", "site", "site_r01", pass, null, now);
    insert.run("usr_op", "operador@reloj.cr", "Operador kiosco", "operator", "site", "site_r01", pass, null, now);
    insert.run("usr_audit", "auditor@reloj.cr", "Auditor", "auditor", "all", null, pass, null, now);
  }

  const sched = db.prepare("SELECT COUNT(*) as n FROM schedules").get() as { n: number };
  if (sched.n === 0) {
    const emps = db.prepare("SELECT id FROM employees").all() as Array<{ id: string }>;
    const ins = db.prepare(
      "INSERT INTO schedules (id,employee_id,weekday,start_hm,end_hm,late_grace_min) VALUES (?,?,?,?,?,?)",
    );
    for (const emp of emps) {
      for (const day of [1, 2, 3, 4, 5]) {
        ins.run(ulid(), emp.id, day, "07:00", "16:00", 10);
      }
    }
  }

  if (!hasColumn(db, "enrollment_audit", "action")) {
    db.exec("ALTER TABLE enrollment_audit ADD COLUMN action TEXT DEFAULT 'enroll'");
  }

  const set = db.prepare("INSERT OR IGNORE INTO settings (key,value) VALUES (?,?)");
  set.run("event_types", JSON.stringify(["IN", "OUT", "BREAK_START", "BREAK_END"]));
  set.run("retention_days", "365");
  set.run("cloud_region_declared", "America/Bogota — declarar región contractual en S05");
  set.run("supervisor_pin", hashPassword(supervisorPin()));
  set.run("product_edition", "oferta-software-v1");
  set.run("alert_absent", "1");
  set.run("alert_late", "1");
  set.run("alert_terminal_offline", "1");
  set.run("alert_sync_failed", "1");

  const existing = db.prepare("SELECT id, descriptor FROM face_templates").all() as Array<{
    id: string;
    descriptor: string;
  }>;
  const upd = db.prepare("UPDATE face_templates SET descriptor=? WHERE id=?");
  for (const row of existing) {
    if (!row.descriptor.startsWith("v1:")) {
      try {
        upd.run(sealJson(JSON.parse(row.descriptor)), row.id);
      } catch {
        /* already opaque */
      }
    }
  }
}

function migrateV3(db: Database.Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS anomalies (
      id TEXT PRIMARY KEY,
      kind TEXT NOT NULL,
      site_id TEXT,
      employee_id TEXT,
      day TEXT NOT NULL,
      message TEXT NOT NULL,
      punch_ids TEXT NOT NULL,
      evidence TEXT NOT NULL,
      reviewed INTEGER NOT NULL DEFAULT 0,
      reviewed_by TEXT,
      created_at TEXT NOT NULL,
      UNIQUE(kind, site_id, day)
    );
  `);
  // Terminales activadas por un usuario: el token del kiosco se valida contra token_id.
  if (!hasColumn(db, "terminals", "token_id")) {
    db.exec("ALTER TABLE terminals ADD COLUMN token_id TEXT");
    db.exec("ALTER TABLE terminals ADD COLUMN activated_by TEXT");
    db.exec("ALTER TABLE terminals ADD COLUMN revoked_at TEXT");
  }
  // Cadena de hashes sobre los eventos (ver src/lib/integrity.ts).
  if (!hasColumn(db, "events", "hash")) {
    db.exec("ALTER TABLE events ADD COLUMN prev_hash TEXT");
    db.exec("ALTER TABLE events ADD COLUMN hash TEXT");
  }
  sealEvents(db);
  globalForDb.__bioV3 = true;
}

/**
 * Sella los eventos que aún no tienen hash (los previos a esta función quedan
 * sellados desde la fecha de migración: no se puede probar nada anterior a ella).
 */
function sealEvents(db: Database.Database) {
  const pending = db
    .prepare("SELECT rowid AS rid, id, type, payload, created_at FROM events WHERE hash IS NULL ORDER BY rowid")
    .all() as Array<{ rid: number; id: string; type: string; payload: string; created_at: string }>;
  db.prepare("INSERT OR IGNORE INTO settings (key, value) VALUES ('integrity_chain_since', ?)").run(
    new Date().toISOString(),
  );
  if (!pending.length) return;
  const last = db
    .prepare("SELECT hash FROM events WHERE hash IS NOT NULL ORDER BY rowid DESC LIMIT 1")
    .get() as { hash: string } | undefined;
  let prev = last?.hash ?? GENESIS_HASH;
  const update = db.prepare("UPDATE events SET prev_hash = ?, hash = ? WHERE rowid = ?");
  db.transaction(() => {
    for (const e of pending) {
      const hash = chainHash(prev, e);
      update.run(prev, hash, e.rid);
      prev = hash;
    }
  })();
}

export function recordEvent(
  db: Database.Database,
  type: string,
  payload: unknown,
) {
  const id = ulid();
  const body = JSON.stringify(payload);
  const createdAt = new Date().toISOString();
  const last = db.prepare("SELECT hash FROM events ORDER BY rowid DESC LIMIT 1").get() as
    | { hash: string | null }
    | undefined;
  const prev = last?.hash ?? GENESIS_HASH;
  db.prepare(
    "INSERT INTO events (id, type, payload, created_at, prev_hash, hash) VALUES (?, ?, ?, ?, ?, ?)",
  ).run(id, type, body, createdAt, prev, chainHash(prev, { id, type, payload: body, created_at: createdAt }));
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
    deleted: Boolean(row.deleted_at),
  };
}

function mapSite(row: Record<string, unknown>): Site {
  return {
    id: String(row.id),
    code: String(row.code),
    name: String(row.name),
    city: String(row.city),
    timezone: String(row.timezone),
    countryId: row.country_id ? String(row.country_id) : null,
    zoneId: row.zone_id ? String(row.zone_id) : null,
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
    method: row.method ? String(row.method) : "face",
    eventType: row.event_type ? String(row.event_type) : String(row.type),
    supervisorId: row.supervisor_id ? String(row.supervisor_id) : null,
    reason: row.reason ? String(row.reason) : null,
    novelty: row.novelty ? String(row.novelty) : null,
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
  return (getDb().prepare("SELECT * FROM sites ORDER BY code").all() as Record<string, unknown>[]).map(
    mapSite,
  );
}

export function getSiteByCode(code: string): Site | undefined {
  const row = getDb()
    .prepare("SELECT * FROM sites WHERE code = ? OR id = ?")
    .get(code, code) as Record<string, unknown> | undefined;
  return row ? mapSite(row) : undefined;
}

export function listEmployees(
  siteId?: string,
  opts?: { includeDeleted?: boolean },
): Employee[] {
  const clauses: string[] = [];
  const params: unknown[] = [];
  if (siteId) {
    clauses.push("(e.site_id = ? OR e.site_id = (SELECT id FROM sites WHERE code = ?))");
    params.push(siteId, siteId);
  }
  if (!opts?.includeDeleted) {
    clauses.push("e.deleted_at IS NULL");
  }
  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  const rows = getDb()
    .prepare(`${EMPLOYEE_SELECT} ${where} ORDER BY e.name`)
    .all(...params) as Record<string, unknown>[];
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
  patch: {
    active?: boolean;
    revokeConsent?: boolean;
    name?: string;
    code?: string;
    siteId?: string;
    deleted?: boolean;
    pin?: string | null;
    role?: string;
  },
) {
  const current = getEmployee(id);
  if (!current) throw new Error("Colaborador no encontrado");
  const db = getDb();
  if (patch.name !== undefined) {
    db.prepare("UPDATE employees SET name = ? WHERE id = ?").run(patch.name.trim(), id);
  }
  if (patch.code !== undefined) {
    db.prepare("UPDATE employees SET code = ? WHERE id = ?").run(patch.code.trim().toUpperCase(), id);
  }
  if (patch.role !== undefined) {
    db.prepare("UPDATE employees SET role = ? WHERE id = ?").run(patch.role.trim(), id);
  }
  if (patch.siteId) {
    const site = getSiteByCode(patch.siteId);
    if (!site) throw new Error("Sede destino no encontrada");
    db.prepare("UPDATE employees SET site_id = ? WHERE id = ?").run(site.id, id);
    recordEvent(db, "employee.transferred", { id, from: current.siteId, to: site.id });
  }
  if (patch.active !== undefined) {
    db.prepare("UPDATE employees SET active = ? WHERE id = ?").run(patch.active ? 1 : 0, id);
    recordEvent(db, "employee.updated", { id, active: patch.active });
  }
  if (patch.pin === null) {
    db.prepare("UPDATE employees SET pin_hash = NULL WHERE id = ?").run(id);
  } else if (typeof patch.pin === "string" && patch.pin.length) {
    db.prepare("UPDATE employees SET pin_hash = ? WHERE id = ?").run(hashPassword(patch.pin), id);
  }
  if (patch.deleted === true) {
    db.prepare("UPDATE employees SET deleted_at = ?, active = 0 WHERE id = ?").run(
      new Date().toISOString(),
      id,
    );
    db.prepare("DELETE FROM face_templates WHERE employee_id = ?").run(id);
    recordEvent(db, "employee.deleted", { id, templatesWiped: true });
  }
  if (patch.deleted === false) {
    db.prepare("UPDATE employees SET deleted_at = NULL WHERE id = ?").run(id);
  }
  if (patch.revokeConsent) {
    db.prepare("UPDATE employees SET consent_at = NULL WHERE id = ?").run(id);
    db.prepare("DELETE FROM face_templates WHERE employee_id = ?").run(id);
    recordEvent(db, "consent.revoked", { id });
  }
  return getEmployee(id)!;
}

export function wipeTemplates(employeeId: string, audit?: { operatorId?: string | null; operatorName?: string | null; userAgent?: string | null }) {
  const emp = getEmployee(employeeId);
  if (!emp) throw new Error("Colaborador no encontrado");
  getDb().prepare("DELETE FROM face_templates WHERE employee_id = ?").run(employeeId);
  getDb()
    .prepare(
      `INSERT INTO enrollment_audit (id, employee_id, operator_id, operator_name, site_id, user_agent, created_at, action)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      ulid(),
      employeeId,
      audit?.operatorId ?? null,
      audit?.operatorName ?? null,
      emp.siteId,
      audit?.userAgent ?? null,
      new Date().toISOString(),
      "wipe",
    );
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
    descriptor: openJson<number[]>(String(row.descriptor)),
    createdAt: String(row.created_at),
  }));
}

export function addTemplates(
  employeeId: string,
  descriptors: number[][],
  audit?: {
    operatorId?: string | null;
    operatorName?: string | null;
    userAgent?: string | null;
    siteId?: string | null;
  },
) {
  const emp = getEmployee(employeeId);
  if (!emp) throw new Error("Colaborador no encontrado");
  const insert = getDb().prepare(
    "INSERT INTO face_templates (id, employee_id, descriptor, created_at) VALUES (?, ?, ?, ?)",
  );
  const now = new Date().toISOString();
  const tx = getDb().transaction(() => {
    for (const descriptor of descriptors) {
      insert.run(ulid(), employeeId, sealJson(descriptor), now);
    }
  });
  tx();
  getDb()
    .prepare(
      `INSERT INTO enrollment_audit (id, employee_id, operator_id, operator_name, site_id, user_agent, created_at, action)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      ulid(),
      employeeId,
      audit?.operatorId ?? null,
      audit?.operatorName ?? null,
      audit?.siteId ?? emp.siteId,
      audit?.userAgent ?? null,
      now,
      "enroll",
    );
  recordEvent(getDb(), "template.enrolled", {
    employeeId,
    count: descriptors.length,
    operator: audit?.operatorName ?? null,
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
        terminal_id, match_score, decision, offline, liveness_hint,
        method, event_type, supervisor_id, reason, novelty
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
      input.method ?? "face",
      input.eventType ?? input.type,
      input.supervisorId ?? null,
      input.reason ?? null,
      null,
    );
  // Los campos de la marca van en el evento sellado para poder cotejarla luego (integrityReport).
  recordEvent(getDb(), "punch.created", {
    id: input.id,
    siteId: site.id,
    employeeId: input.employeeId,
    type: input.type,
    capturedAt: input.capturedAt,
    terminalId: input.terminalId,
    decision: input.decision,
    offline: Boolean(input.offline),
    method: input.method ?? "face",
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
  fromExclusive?: string;
  to?: string;
  afterId?: string;
  employeeId?: string;
  limit?: number;
  order?: "asc" | "desc";
}): Punch[] {
  const clauses: string[] = [];
  const params: unknown[] = [];
  if (filters.siteId) {
    clauses.push(
      "(p.site_id = ? OR p.site_id = (SELECT id FROM sites WHERE code = ?))",
    );
    params.push(filters.siteId, filters.siteId);
  }
  if (filters.employeeId) {
    clauses.push("p.employee_id = ?");
    params.push(filters.employeeId);
  }
  if (filters.from) {
    clauses.push("p.captured_at >= ?");
    params.push(filters.from);
  }
  if (filters.fromExclusive) {
    clauses.push("p.captured_at > ?");
    params.push(filters.fromExclusive);
  }
  if (filters.to) {
    clauses.push("p.captured_at <= ?");
    params.push(filters.to);
  }
  if (filters.afterId) {
    clauses.push("p.id > ?");
    params.push(filters.afterId);
  }
  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  const limit = Math.min(filters.limit ?? 200, 5000);
  const order = filters.order === "asc" ? "ASC" : "DESC";
  const rows = getDb()
    .prepare(
      `${PUNCH_SELECT} ${where} ORDER BY p.captured_at ${order}, p.id ${order} LIMIT ?`,
    )
    .all(...params, limit) as Record<string, unknown>[];
  return rows.map(mapPunch);
}

export function todayBounds(timezone = TIMEZONE) {
  const now = new Date();
  const local = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
  const start = new Date(`${local}T00:00:00${UTC_OFFSET}`).toISOString();
  const end = new Date(`${local}T23:59:59.999${UTC_OFFSET}`).toISOString();
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

export function activateTerminal(input: {
  siteId: string;
  label?: string;
  userAgent: string;
  activatedBy: string;
}) {
  const site = getSiteByCode(input.siteId);
  if (!site) throw new Error("Sede no encontrada");
  const terminalId = ulid();
  const tokenId = ulid();
  const db = getDb();
  db.prepare(
    `INSERT INTO terminals (id, site_id, label, last_seen, user_agent, path, token_id, activated_by)
     VALUES (?, ?, ?, ?, ?, '/kiosk', ?, ?)`,
  ).run(
    terminalId,
    site.id,
    input.label?.trim() || `Kiosco ${site.code}`,
    new Date().toISOString(),
    input.userAgent,
    tokenId,
    input.activatedBy,
  );
  recordEvent(db, "terminal.activated", { terminalId, siteId: site.id, by: input.activatedBy });
  return { terminalId, tokenId, site };
}

/** true si el token sigue siendo el vigente de esa terminal y no fue revocado. */
export function terminalTokenActive(terminalId: string, tokenId: string) {
  const row = getDb()
    .prepare("SELECT token_id, revoked_at FROM terminals WHERE id = ?")
    .get(terminalId) as { token_id: string | null; revoked_at: string | null } | undefined;
  return Boolean(row && row.token_id === tokenId && !row.revoked_at);
}

export function revokeTerminal(terminalId: string, by: string) {
  const db = getDb();
  const result = db
    .prepare("UPDATE terminals SET revoked_at = ? WHERE id = ? AND revoked_at IS NULL")
    .run(new Date().toISOString(), terminalId);
  if (result.changes) recordEvent(db, "terminal.revoked", { terminalId, by });
  return result.changes > 0;
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
    revoked: Boolean(row.revoked_at),
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
