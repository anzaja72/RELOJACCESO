// Datos DEMO del ajuste «Aplicación Tiendas»: Barranquilla (Buenavista, Alto Prado), una sede de
// Cartagena por confirmar, 10 empleados ficticios con su tipo de jornada y 5 usuarios de prueba.
// Idempotente (INSERT OR IGNORE) y solo para demo: NO lo ejecute sobre datos reales.
// Requiere que la app haya arrancado al menos una vez (crea las tablas).
// Uso: node scripts/seed-tiendas.mjs   ·   npm run seed:tiendas
import Database from "better-sqlite3";
import { randomBytes, scryptSync } from "node:crypto";
import path from "node:path";
import { pathToFileURL } from "node:url";

const hash = (password) => {
  const salt = randomBytes(16).toString("hex");
  return `${salt}:${scryptSync(password, salt, 32).toString("hex")}`;
};

export function seedTiendas(db, { password }) {
  const has = (table) => db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(table);
  if (!has("employee_types") || !has("users")) {
    throw new Error("Faltan tablas: arranque la app una vez (npm run dev) antes de sembrar.");
  }
  const now = new Date().toISOString();
  const zone = db.prepare("SELECT id, country_id FROM zones WHERE id = 'zone_caribe'").get();
  if (!zone) throw new Error("No existe la región zone_caribe en esta base.");

  const site = db.prepare(
    `INSERT OR IGNORE INTO sites (id, code, name, city, timezone, country_id, zone_id, opens_hm, closes_hm)
     VALUES (?, ?, ?, ?, 'America/Bogota', ?, ?, '07:00', '22:00')`,
  );
  site.run("site_baq_bv", "BAQ-BV", "Buenavista", "Barranquilla", zone.country_id, zone.id);
  site.run("site_baq_ap", "BAQ-AP", "Alto Prado", "Barranquilla", zone.country_id, zone.id);
  // Las sedes de Cartagena no están identificadas en las fuentes.
  if (!db.prepare("SELECT 1 FROM sites WHERE city = 'Cartagena' AND zone_id = ?").get(zone.id)) {
    site.run("site_ctg_01", "CTG-01", "Sede por confirmar", "Cartagena", zone.country_id, zone.id);
  }
  const ctg = db.prepare("SELECT id FROM sites WHERE city = 'Cartagena' AND zone_id = ? ORDER BY code LIMIT 1").get(zone.id).id;

  const emp = db.prepare(
    `INSERT OR IGNORE INTO employees
      (id, code, name, site_id, role, active, consent_at, created_at, document_id, employee_type_id, employment_status)
     VALUES (?, ?, ?, ?, ?, 1, NULL, ?, ?, ?, 'activo')`,
  );
  const demo = [
    ["emp_bv_gj", "BV-001", "Laura Pérez (demo)", "site_baq_bv", "Gerente Junior", "DEMO-BV-001", "et_gj"],
    ["emp_bv_ct", "BV-002", "Jorge Díaz (demo)", "site_baq_bv", "Coordinador de Turno", "DEMO-BV-002", "et_ct"],
    ["emp_bv_tc", "BV-003", "Camila Rojas (demo)", "site_baq_bv", "Empleado General", "DEMO-BV-003", "et_tc"],
    ["emp_bv_mt", "BV-004", "Andrés Gómez (demo)", "site_baq_bv", "Empleado Medio Tiempo", "DEMO-BV-004", "et_mt"],
    ["emp_bv_bk", "BV-005", "Valentina Ruiz (demo)", "site_baq_bv", "AMIGO BK", "DEMO-BV-005", "et_bk"],
    ["emp_ap_gj", "AP-001", "Diana Castro (demo)", "site_baq_ap", "Gerente Junior", "DEMO-AP-001", "et_gj"],
    ["emp_ap_ct", "AP-002", "Mateo Herrera (demo)", "site_baq_ap", "Coordinador de Turno", "DEMO-AP-002", "et_ct"],
    ["emp_ap_tc", "AP-003", "Sara Molina (demo)", "site_baq_ap", "Empleado General", "DEMO-AP-003", "et_tc"],
    ["emp_ap_bk", "AP-004", "Felipe Ortiz (demo)", "site_baq_ap", "AMIGO BK", "DEMO-AP-004", "et_bk"],
    ["emp_ctg_gj", "CTG-001", "Paula Navarro (demo)", ctg, "Gerente Junior", "DEMO-CTG-001", "et_gj"],
  ];
  for (const [id, code, name, siteId, role, doc, typeId] of demo) emp.run(id, code, name, siteId, role, now, doc, typeId);

  const user = db.prepare(
    `INSERT OR IGNORE INTO users (id,email,name,role,scope_type,scope_id,password_hash,totp_secret,totp_enabled,active,created_at)
     VALUES (?,?,?,?,?,?,?,NULL,0,1,?)`,
  );
  const pass = hash(password);
  user.run("usr_rrhh", "rrhh@reloj.cr", "Recursos Humanos", "hr", "all", null, pass, now);
  user.run("usr_ivan", "ivan@reloj.cr", "Iván · Gerente regional Caribe", "zone_manager", "zone", "zone_caribe", pass, now);
  user.run("usr_bv", "buenavista@reloj.cr", "Gerente tienda Buenavista", "site_manager", "site", "site_baq_bv", pass, now);
  user.run("usr_ap", "altoprado@reloj.cr", "Gerente tienda Alto Prado", "site_manager", "site", "site_baq_ap", pass, now);
  user.run("usr_coord", "coordinador@reloj.cr", "Coordinador Buenavista", "operator", "site", "site_baq_bv", pass, now);
  return { sites: ["site_baq_bv", "site_baq_ap", ctg], employees: demo.length, users: 5 };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const password = process.env.ADMIN_PASSWORD;
  if (!password) {
    console.error("Defina ADMIN_PASSWORD: es la contraseña que tendrán los 5 usuarios demo.");
    process.exit(1);
  }
  const dataDir = process.env.DATA_DIR || path.join(process.cwd(), "data");
  const file = path.join(dataDir, process.env.SANDBOX === "true" ? "asistencia.sandbox.db" : "asistencia.db");
  const db = new Database(file);
  db.pragma("foreign_keys = ON");
  console.log("Sembrado:", seedTiendas(db, { password }));
}
