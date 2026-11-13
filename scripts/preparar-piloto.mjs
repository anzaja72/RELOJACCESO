// Deja producción lista para el piloto de Barranquilla, en UNA sola ejecución DENTRO del contenedor:
//   1. Crea la tienda Buenavista (BV) si no existe.
//   2. Borra las tiendas de demostración (todo menos AP y BV) con la limpieza de la app (respaldo + auditoría).
//   3. Borra los usuarios de demostración y deja (o crea) los usuarios del piloto, uno por perfil.
//   4. Pone el horario de Alto Prado: abre 08:00, cierra 04:00 (madrugada).
//   5. Carga el cronograma de Alto Prado (archivo INFO ALTO PRADO) como BORRADOR de la próxima semana,
//      para que el gerente lo revise, lo ajuste (en el Planificador o por MCP) y lo envíe.
//   6. Verifica: solo quedan AP y BV, integridad OK, usuarios y cronograma.
//
// Uso en el VPS (muestra el plan completo y pide escribir SI antes de cambiar nada):
//   docker cp scripts/preparar-piloto.mjs reloj-cr:/app/scripts/preparar-piloto.mjs
//   docker exec -it -e PASSWORD reloj-cr node scripts/preparar-piloto.mjs
// El script no lleva cédulas: el cronograma va por código de empleado (AP-01 … AP-13).
import Database from "better-sqlite3";
import { randomBytes, scryptSync } from "node:crypto";
import path from "node:path";
import { createInterface } from "node:readline/promises";
import { ulid } from "ulidx";

const BASE = (process.env.BASE || "http://127.0.0.1:47321").replace(/\/$/, "");
const DATA_DIR = process.env.DATA_DIR || "/data";
const ADMIN = (process.env.ADMIN_EMAIL || "admin@reloj.cr").toLowerCase();
const PASSWORD = process.env.PASSWORD;
const SI = process.argv.includes("--si");

const AP = { code: "AP", name: "Alto Prado" };
const BV = { code: "BV", name: "Buenavista", city: "Barranquilla" };
const HORARIO_AP = { opensHm: "08:00", closesHm: "04:00" };

/** Usuarios del piloto (uno por perfil). `scope` se resuelve con las tiendas reales. */
const PILOTO = [
  { email: "regional.caribe@reloj.cr", name: "Gerente Regional Caribe", role: "zone_manager", scope: "zona" },
  { email: "gerente.ap@reloj.cr", name: "Gerente Alto Prado", role: "site_manager", scope: "AP" },
  { email: "gerente.bv@reloj.cr", name: "Gerente Buenavista", role: "site_manager", scope: "BV" },
  { email: "coordinador.ap@reloj.cr", name: "Coordinador Alto Prado", role: "operator", scope: "AP" },
  { email: "rrhh@reloj.cr", name: "Recursos Humanos", role: "hr", scope: "all" },
  { email: "auditor.prueba@reloj.cr", name: "Auditor de prueba", role: "auditor", scope: "all" },
];
/** Usuarios que crean las semillas de demostración (db.ts y seed-tiendas.mjs): siempre se borran. */
const SEMILLA = new Set(["usr_zona", "usr_sede", "usr_op", "usr_audit", "usr_rrhh", "usr_ivan", "usr_bv", "usr_ap", "usr_coord"]);

/** Cronograma de Alto Prado (archivo INFO ALTO PRADO), por código. Días: lunes … domingo. "" = no se toca. */
const CRONOGRAMA_AP = {
  "AP-01": { almuerzo: 60, dias: ["08:00-16:00", "08:00-16:00", "08:00-16:00", "08:00-16:00", "08:00-16:00", "08:00-16:00", "DESCANSO"] },
  "AP-02": { almuerzo: 60, dias: ["DESCANSO", "14:00-22:00", "14:00-22:00", "14:00-22:00", "14:00-22:00", "14:00-22:00", "14:00-22:00"] },
  "AP-03": { almuerzo: 60, dias: ["20:00-04:00", "DESCANSO", "20:00-04:00", "20:00-04:00", "20:00-04:00", "20:00-04:00", "20:00-04:00"] },
  "AP-04": { almuerzo: 60, dias: ["08:00-16:00", "08:00-16:00", "08:00-16:00", "08:00-16:00", "08:00-16:00", "08:00-16:00", "DESCANSO"] },
  "AP-05": { almuerzo: 60, dias: ["DESCANSO", "08:00-16:00", "08:00-16:00", "08:00-16:00", "08:00-16:00", "08:00-16:00", "08:00-16:00"] },
  "AP-06": { almuerzo: 60, dias: ["12:00-20:00", "DESCANSO", "12:00-20:00", "12:00-20:00", "12:00-20:00", "12:00-20:00", "12:00-20:00"] },
  "AP-07": { almuerzo: 60, dias: ["12:00-20:00", "12:00-20:00", "DESCANSO", "12:00-20:00", "12:00-20:00", "12:00-20:00", "12:00-20:00"] },
  "AP-08": { almuerzo: 60, dias: ["14:00-22:00", "14:00-22:00", "14:00-22:00", "DESCANSO", "14:00-22:00", "14:00-22:00", "14:00-22:00"] },
  "AP-09": { almuerzo: 60, dias: ["14:00-22:00", "14:00-22:00", "14:00-22:00", "14:00-22:00", "DESCANSO", "14:00-22:00", "14:00-22:00"] },
  "AP-10": { almuerzo: 60, dias: ["20:00-04:00", "20:00-04:00", "20:00-04:00", "20:00-04:00", "20:00-04:00", "DESCANSO", "20:00-04:00"] },
  "AP-11": { almuerzo: 60, dias: ["20:00-04:00", "20:00-04:00", "20:00-04:00", "20:00-04:00", "20:00-04:00", "20:00-04:00", "DESCANSO"] },
  "AP-12": { almuerzo: 60, dias: ["", "", "", "", "14:00-22:00", "14:00-22:00", "14:00-22:00"] },
  "AP-13": { almuerzo: 36, dias: ["DESCANSO", "12:00-21:00", "12:00-21:00", "12:00-21:00", "12:00-21:00", "12:00-21:00", "DESCANSO"] },
};

const fail = (msg) => {
  console.error(`\n✗ ${msg}\nNo se cambió nada más.`);
  process.exit(1);
};
const norm = (s) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toLowerCase();
const call = async (method, route, token, body, params) => {
  const url = new URL(`${BASE}/api/v1/${route}`);
  for (const [k, v] of Object.entries(params ?? {})) url.searchParams.set(k, String(v));
  const res = await fetch(url, { method, headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
  return { status: res.status, data: await res.json().catch(() => ({})) };
};
const nextMonday = () => {
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota" }).format(new Date());
  const d = new Date(`${today}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + (((8 - d.getUTCDay()) % 7) || 7));
  return d.toISOString().slice(0, 10);
};
const addDays = (date, n) => {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const newPassword = () => randomBytes(12).toString("base64url");
const hashPassword = (pw) => {
  const salt = randomBytes(16).toString("hex");
  return `${salt}:${scryptSync(pw, salt, 32).toString("hex")}`;
};

async function main() {
  if (!PASSWORD) fail("Falta la contraseña del admin (PASSWORD).");
  console.log(`PREPARAR PILOTO · ${BASE}`);

  // ── Sesión y versión ──────────────────────────────────────────────
  const login = await call("POST", "auth/login", null, { email: ADMIN, password: PASSWORD });
  if (!login.data.token) fail(`No se pudo iniciar sesión como ${ADMIN} (${login.status}: ${login.data.error ?? ""}). Revise la contraseña.`);
  if (login.data.user.role !== "superadmin") fail(`${ADMIN} no es superadmin.`);
  const token = login.data.token;

  // ── Tiendas ───────────────────────────────────────────────────────
  const sites = (await call("GET", "sites", token)).data.sites ?? [];
  const ap = sites.find((s) => norm(s.code) === "ap") ?? sites.find((s) => norm(s.name) === norm(AP.name));
  if (!ap) fail("No existe la tienda Alto Prado (AP). Primero cargue los trabajadores con importar-empleados.");
  const zoneId = ap.zoneId ?? ap.zone_id;
  if (!zoneId) fail("Alto Prado no tiene región asignada.");
  const bvExisting = sites.find((s) => norm(s.code) === "bv") ?? sites.find((s) => norm(s.name) === norm(BV.name));

  const keep = [ap.code, ...(bvExisting ? [bvExisting.code] : [])];
  const preview = await call("POST", "purge", token, { keep, execute: false });
  if (preview.status === 404) fail("La app de producción no tiene la limpieza (/api/v1/purge). Falta desplegar la versión nueva.");
  if (preview.status !== 200) fail(preview.data.error ?? `Limpieza: HTTP ${preview.status}`);
  const purge = preview.data;

  // ── Empleados de Alto Prado y cronograma ─────────────────────────
  const employees = ((await call("GET", "employees", token)).data.employees ?? []).filter((e) => e.siteId === ap.id);
  const byCode = new Map(employees.map((e) => [String(e.code).toUpperCase(), e]));
  const missing = Object.keys(CRONOGRAMA_AP).filter((c) => !byCode.has(c));
  if (missing.length) fail(`En Alto Prado faltan estos códigos: ${missing.join(", ")}. Cargue los trabajadores primero.`);
  const week = nextMonday();
  const planNow = (await call("GET", "plans", token, null, { site: ap.id, week })).data;
  const planStatus = planNow.plan?.status;
  const canLoadPlan = !planNow.plan || ["borrador", "devuelto"].includes(planStatus);

  // ── Usuarios (base de datos del contenedor) ──────────────────────
  const db = new Database(path.join(DATA_DIR, "asistencia.db"));
  db.pragma("busy_timeout = 5000");
  const users = db.prepare("SELECT id, email, name, role, scope_type, scope_id FROM users ORDER BY email").all();
  const pilotEmails = new Set(PILOTO.map((p) => p.email));
  const borrar = users.filter((u) => u.email !== ADMIN && u.role !== "kiosk" && (SEMILLA.has(u.id) || (u.email.endsWith("@reloj.cr") && !pilotEmails.has(u.email))));
  const quedan = users.filter((u) => !borrar.includes(u));
  const crear = PILOTO.filter((p) => !quedan.some((u) => u.email === p.email));

  // ── Plan ──────────────────────────────────────────────────────────
  console.log("\nESTO ES LO QUE SE VA A HACER:");
  console.log(`\n1) Tiendas que quedan: ${ap.name} (${ap.code}) y ${bvExisting ? `${bvExisting.name} (${bvExisting.code})` : `${BV.name} (${BV.code}) — se CREA`}`);
  console.log("   Se BORRAN (con sus empleados, marcaciones y cronogramas de demostración):");
  if (!purge.remove.length) console.log("   (ninguna: ya solo están las del piloto)");
  purge.remove.forEach((s) => console.log(`   ✗ ${s.code.padEnd(6)} ${s.name.padEnd(30)} ${s.city.padEnd(14)} ${s.employees} empleados · ${s.punches} marcaciones`));
  console.log(`\n2) Usuarios de demostración que se BORRAN: ${borrar.length ? "" : "(ninguno)"}`);
  borrar.forEach((u) => console.log(`   ✗ ${u.email.padEnd(28)} ${u.role}`));
  console.log("   Usuarios que QUEDAN:");
  quedan.forEach((u) => console.log(`   ✓ ${u.email.padEnd(28)} ${u.role}`));
  crear.forEach((p) => console.log(`   + ${p.email.padEnd(28)} ${p.role}  (se CREA con contraseña nueva)`));
  console.log(`\n3) Horario de ${ap.name}: abre ${HORARIO_AP.opensHm}, cierra ${HORARIO_AP.closesHm} (madrugada). Hoy: ${ap.opensHm ?? "—"}–${ap.closesHm ?? "—"}`);
  console.log(
    canLoadPlan
      ? `\n4) Cronograma de ${ap.name}, semana del ${week}: se cargan los turnos del archivo (13 personas) como BORRADOR.`
      : `\n4) Cronograma de la semana del ${week}: ya está ${planStatus}; NO se toca.`,
  );

  if (!SI) {
    if (!process.stdin.isTTY) fail("No hay terminal para confirmar: use docker exec -it.");
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    const answer = await rl.question("\nEscriba SI para hacerlo todo (se hace un respaldo antes de borrar): ");
    rl.close();
    if (answer.trim().toUpperCase() !== "SI") {
      console.log("Cancelado: no se cambió nada.");
      process.exit(0);
    }
  }

  // ── 1. Buenavista ────────────────────────────────────────────────
  let bv = bvExisting;
  if (!bv) {
    const created = await call("POST", "sites", token, { code: BV.code, name: BV.name, city: BV.city, zoneId });
    if (created.status !== 201 && created.status !== 200) fail(`No se pudo crear Buenavista: ${created.data.error ?? created.status}`);
    bv = created.data.site ?? created.data;
    console.log(`\n✓ Tienda creada: ${bv.name} (${bv.code})`);
  }

  // ── 2. Limpieza de tiendas demo ──────────────────────────────────
  if (purge.remove.length) {
    const done = await call("POST", "purge", token, { keep: [ap.code, bv.code], execute: true, confirm: "BORRAR" });
    if (done.status !== 200) fail(`Limpieza: ${done.data.error ?? done.status}`);
    console.log(`✓ Tiendas de demostración borradas (${done.data.counts.sites}). Respaldo: ${done.data.backup}`);
  }

  // ── 3. Usuarios ──────────────────────────────────────────────────
  const scopeOf = (p) => (p.scope === "all" ? ["all", null] : p.scope === "zona" ? ["zone", zoneId] : ["site", p.scope === "AP" ? ap.id : bv.id]);
  const nuevos = [];
  db.transaction(() => {
    const del = db.prepare("DELETE FROM users WHERE id = ?");
    for (const u of borrar) del.run(u.id);
    const ins = db.prepare(
      "INSERT INTO users (id,email,name,role,scope_type,scope_id,password_hash,totp_secret,totp_enabled,active,created_at) VALUES (?,?,?,?,?,?,?,NULL,0,1,?)",
    );
    const fix = db.prepare("UPDATE users SET role = ?, scope_type = ?, scope_id = ?, active = 1 WHERE email = ?");
    for (const p of PILOTO) {
      const [type, id] = scopeOf(p);
      if (crear.includes(p)) {
        const pw = newPassword();
        ins.run(`usr_${ulid().toLowerCase()}`, p.email, p.name, p.role, type, id, hashPassword(pw), new Date().toISOString());
        nuevos.push({ email: p.email, pw });
      } else fix.run(p.role, type, id, p.email);
    }
  })();
  console.log(`✓ Usuarios: ${borrar.length} de demostración borrados · ${nuevos.length} creados · perfiles del piloto verificados`);

  // ── 4. Horario de Alto Prado ─────────────────────────────────────
  const hours = await fetch(`${BASE}/api/v1/site-hours`, { method: "PUT", headers: { "content-type": "application/json", authorization: `Bearer ${token}` }, body: JSON.stringify({ siteId: ap.id, ...HORARIO_AP }) });
  if (!hours.ok) fail(`Horario de Alto Prado: ${(await hours.json().catch(() => ({}))).error ?? hours.status}`);
  console.log(`✓ Horario de ${ap.name}: ${HORARIO_AP.opensHm}–${HORARIO_AP.closesHm}`);

  // ── 5. Cronograma borrador ───────────────────────────────────────
  let view = planNow;
  if (canLoadPlan) {
    if (!view.plan) {
      const created = await call("POST", "plans", token, { siteId: ap.id, weekStart: week });
      if (created.status !== 201) fail(`No se pudo abrir el cronograma: ${created.data.error ?? created.status}`);
      view = created.data;
    }
    const cells = [];
    for (const [code, { almuerzo, dias }] of Object.entries(CRONOGRAMA_AP)) {
      const employeeId = byCode.get(code).id;
      dias.forEach((v, i) => {
        const date = addDays(week, i);
        if (v === "DESCANSO") cells.push({ employeeId, date, kind: "descanso" });
        else if (v) {
          const [startHm, endHm] = v.split("-");
          cells.push({ employeeId, date, kind: "turno", startHm, endHm, lunchMin: almuerzo });
        }
      });
    }
    const saved = await call("PUT", `plans/${view.plan.id}`, token, { cells });
    if (saved.status !== 200) fail(`Reloj rechazó los turnos: ${saved.data.error ?? saved.status}`);
    view = saved.data;
    console.log(`✓ Cronograma ${ap.name} semana ${week}: ${cells.filter((c) => c.kind === "turno").length} turnos y ${cells.filter((c) => c.kind === "descanso").length} descansos en BORRADOR (v${view.plan.version})`);
    if (view.coverage?.length) console.log(`  ⚠ ${view.coverage.length} franja(s) sin gerente ni coordinador: ${view.coverage.slice(0, 4).map((g) => `${g.date} ${g.fromHm}-${g.toHm}`).join("; ")}${view.coverage.length > 4 ? "…" : ""}`);
    (view.warnings ?? []).slice(0, 8).forEach((w) => console.log(`  ⚠ ${w.message}`));
  }

  // ── 6. Verificación ──────────────────────────────────────────────
  const after = (await call("GET", "sites", token)).data.sites ?? [];
  const integrity = (await call("GET", "integrity", token)).data;
  const ok = integrity.ok ?? integrity.status === "ok";
  console.log("\nVERIFICACIÓN:");
  console.log(`  Tiendas: ${after.map((s) => `${s.name} (${s.code})`).join(", ")}`);
  console.log(`  Empleados en ${ap.name}: ${employees.length}`);
  console.log(`  Integridad de la auditoría: ${ok ? "OK" : "REVISAR"}`);
  const finalUsers = db.prepare("SELECT email, role FROM users WHERE active = 1 ORDER BY role, email").all();
  console.log("  Usuarios activos:");
  finalUsers.forEach((u) => console.log(`    ${u.email.padEnd(28)} ${u.role}`));
  if (nuevos.length) {
    console.log("\nCONTRASEÑAS NUEVAS (cópielas ahora, no se vuelven a mostrar):");
    nuevos.forEach((n) => console.log(`    ${n.email.padEnd(28)} ${n.pw}`));
  }
  console.log("\nListo. Entre a la app con cada perfil; el gerente de Alto Prado ve su cronograma en el Planificador (o por MCP) y lo envía.");
}

main().catch((e) => fail(e.message));
