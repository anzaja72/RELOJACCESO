// Crea un usuario real (p. ej. RR. HH. o un gerente) sin exponer la contraseña en la línea de comandos.
// Uso: NEW_USER_PASSWORD='...' node scripts/create-user.mjs --email x@y.co --name "Nombre" \
//        --role hr|zone_manager|site_manager|operator|auditor|superadmin [--scope-type all|zone|site --scope-id zone_caribe]
import Database from "better-sqlite3";
import { randomBytes, scryptSync } from "node:crypto";
import path from "node:path";
import { ulid } from "ulidx";

const arg = (name) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : undefined;
};
const fail = (msg) => {
  console.error(msg);
  process.exit(1);
};

const email = arg("email")?.trim().toLowerCase();
const name = arg("name")?.trim();
const role = arg("role");
const password = process.env.NEW_USER_PASSWORD;
const ROLES = ["hr", "zone_manager", "site_manager", "operator", "auditor", "superadmin"];
if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) fail("--email inválido");
if (!name) fail("--name es obligatorio");
if (!ROLES.includes(role)) fail(`--role debe ser uno de: ${ROLES.join(", ")}`);
if (!password || password.length < 12) fail("Defina NEW_USER_PASSWORD (mínimo 12 caracteres)");

const scopeType = arg("scope-type") ?? (["hr", "auditor", "superadmin"].includes(role) ? "all" : role === "zone_manager" ? "zone" : "site");
const scopeId = scopeType === "all" ? null : arg("scope-id");
if (!["all", "zone", "site"].includes(scopeType)) fail("--scope-type debe ser all, zone o site");
if (scopeType !== "all" && !scopeId) fail("--scope-id es obligatorio con alcance zone o site");

const dataDir = process.env.DATA_DIR || path.join(process.cwd(), "data");
const db = new Database(path.join(dataDir, process.env.SANDBOX === "true" ? "asistencia.sandbox.db" : "asistencia.db"));
if (scopeType !== "all") {
  const table = scopeType === "zone" ? "zones" : "sites";
  if (!db.prepare(`SELECT 1 FROM ${table} WHERE id = ?`).get(scopeId)) fail(`No existe ${scopeType} '${scopeId}'`);
}
if (db.prepare("SELECT 1 FROM users WHERE email = ?").get(email)) fail("Ya existe un usuario con ese correo");
const salt = randomBytes(16).toString("hex");
const hash = `${salt}:${scryptSync(password, salt, 32).toString("hex")}`;
db.prepare(
  `INSERT INTO users (id,email,name,role,scope_type,scope_id,password_hash,totp_secret,totp_enabled,active,created_at)
   VALUES (?,?,?,?,?,?,?,NULL,0,1,?)`,
).run(`usr_${ulid().toLowerCase()}`, email, name, role, scopeType, scopeId, hash, new Date().toISOString());
console.log(`Usuario creado: ${email} (${role}, alcance ${scopeType}${scopeId ? ` ${scopeId}` : ""})`);
