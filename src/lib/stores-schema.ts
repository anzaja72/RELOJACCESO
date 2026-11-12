import type Database from "better-sqlite3";

/**
 * Esquema del ajuste «Aplicación Tiendas». Idempotente y solo de estructura y catálogo:
 * no inserta tiendas, empleados ni usuarios (eso es de `scripts/seed-tiendas.mjs`, solo demo),
 * para no contaminar una base de producción.
 *
 * El salario no se guarda aquí: vive en `contracts` (nómina), que ya existe.
 */

function hasColumn(db: Database.Database, table: string, name: string) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
  return cols.some((c) => c.name === name);
}

function addColumn(db: Database.Database, table: string, name: string, ddl: string) {
  if (!hasColumn(db, table, name)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${name} ${ddl}`);
}

export function migrateStores(db: Database.Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS employee_types (
      id TEXT PRIMARY KEY,
      name TEXT UNIQUE NOT NULL,
      days_per_week INTEGER,
      variable_days INTEGER NOT NULL DEFAULT 0,
      weekly_hours REAL,
      min_weekly_hours REAL,
      is_shift_lead INTEGER NOT NULL DEFAULT 0,
      lunch_min INTEGER NOT NULL DEFAULT 30,
      valid_from TEXT,
      active INTEGER NOT NULL DEFAULT 1,
      note TEXT,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS store_access (
      id TEXT PRIMARY KEY,
      employee_id TEXT NOT NULL,
      site_id TEXT NOT NULL,
      kind TEXT NOT NULL,
      from_site_id TEXT,
      start_date TEXT,
      end_date TEXT,
      reason TEXT,
      authorized_by TEXT NOT NULL,
      created_at TEXT NOT NULL,
      revoked_at TEXT,
      revoked_by TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_store_access_emp ON store_access(employee_id);
    CREATE TABLE IF NOT EXISTS shift_plans (
      id TEXT PRIMARY KEY,
      site_id TEXT NOT NULL,
      week_start TEXT NOT NULL,
      version INTEGER NOT NULL,
      status TEXT NOT NULL,
      created_by TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      submitted_by TEXT,
      submitted_at TEXT,
      decided_by TEXT,
      decided_at TEXT,
      comment TEXT,
      change_reason TEXT,
      UNIQUE(site_id, week_start, version)
    );
    CREATE TABLE IF NOT EXISTS shift_cells (
      plan_id TEXT NOT NULL,
      employee_id TEXT NOT NULL,
      date TEXT NOT NULL,
      kind TEXT NOT NULL,
      start_hm TEXT,
      end_hm TEXT,
      lunch_min INTEGER,
      note TEXT,
      PRIMARY KEY (plan_id, employee_id, date)
    );
    CREATE TABLE IF NOT EXISTS novelties (
      id TEXT PRIMARY KEY,
      kind TEXT NOT NULL,
      type TEXT NOT NULL,
      employee_id TEXT NOT NULL,
      site_id TEXT,
      start_date TEXT NOT NULL,
      end_date TEXT NOT NULL,
      minutes INTEGER,
      punch_id TEXT,
      note TEXT,
      evidence TEXT,
      status TEXT NOT NULL,
      created_by TEXT NOT NULL,
      created_at TEXT NOT NULL,
      decided_by TEXT,
      decided_at TEXT,
      decision_comment TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_novelties_emp ON novelties(employee_id, start_date);
  `);

  addColumn(db, "sites", "opens_hm", "TEXT");
  addColumn(db, "sites", "closes_hm", "TEXT");
  addColumn(db, "employees", "document_id", "TEXT");
  addColumn(db, "employees", "employee_type_id", "TEXT");
  addColumn(db, "employees", "employment_status", "TEXT NOT NULL DEFAULT 'activo'");
  addColumn(db, "punches", "store_authorized", "INTEGER");
  db.exec(
    "CREATE UNIQUE INDEX IF NOT EXISTS idx_employees_document ON employees(document_id) WHERE document_id IS NOT NULL",
  );

  seedEmployeeTypes(db);
}

const NOTE_ANEXO = "Valor de referencia del anexo (punto 3); sujeto a validación jurídica/contractual.";

/** Catálogo de jornadas del anexo. Es configuración, no datos de prueba: `INSERT OR IGNORE` respeta lo que RR. HH. edite. */
function seedEmployeeTypes(db: Database.Database) {
  const now = new Date().toISOString();
  const type = db.prepare(
    `INSERT OR IGNORE INTO employee_types
      (id, name, days_per_week, variable_days, weekly_hours, min_weekly_hours, is_shift_lead, lunch_min, valid_from, active, note, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, 30, ?, 1, ?, ?)`,
  );
  type.run("et_gj", "Gerente Junior", 6, 0, 42, null, 1, "2026-11-01", NOTE_ANEXO, now);
  type.run("et_ct", "Coordinador de Turno", 6, 0, 42, null, 1, "2026-11-01", NOTE_ANEXO, now);
  type.run("et_tc", "Empleado General Tiempo Completo", 6, 0, 42, null, 0, "2026-11-01", NOTE_ANEXO, now);
  type.run("et_mt", "Medio Tiempo Jornada Variable", null, 1, null, 21, 0, "2026-11-01", NOTE_ANEXO, now);
  type.run("et_bk", "AMIGO BK", 5, 0, 42, null, 0, "2026-11-01", NOTE_ANEXO, now);
}
