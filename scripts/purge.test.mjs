/** Limpieza de datos de demostración: respaldo, candado de personas reales, evento sellado e integridad. */
import assert from "node:assert/strict";
import { existsSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

process.env.DATA_DIR = mkdtempSync(path.join(tmpdir(), "reloj-purge-"));
const { getDb, getEmployee, listEmployees, listSites, patchEmployee, upsertPunch } = await import("@/lib/db");
const { integrityReport } = await import("@/lib/db-ops");
const { purgeStores } = await import("@/lib/purge");
const { seedTiendas } = await import("../scripts/seed-tiendas.mjs");
const S = await import("@/lib/stores");

const db = getDb();
seedTiendas(db, { password: "prueba-no-productiva-1" });
const root = { id: "u", email: "admin@test", name: "Admin", role: "superadmin", scopeType: "all", scopeId: null, via: "jwt" };
const KEEP = ["site_baq_ap", "site_baq_bv"];
const rejects = (promise, code) => assert.rejects(promise, (e) => e instanceof S.DomainError && (code ? e.code === code : true));

let n = 0;
const punch = (employeeId, siteId, type = "IN") =>
  upsertPunch({ id: `01PURGE${String(++n).padStart(19, "0")}`, employeeId, siteId, type, capturedAt: new Date(Date.UTC(2026, 10, 10, 13, n)).toISOString(), terminalId: "T-test", matchScore: 0.3, decision: "matched", livenessHint: "pass" });

// Datos de demostración en tiendas que se borrarán (R01, R02, CTG-01) y en las que se conservan.
punch("emp_ana", "site_r01");
punch("emp_ana", "site_r01", "OUT");
punch("emp_luis", "site_r02");
punch(null, "site_r01"); // marca sin empleado reconocido
punch("emp_ctg_gj", "site_ctg_01");
punch("emp_bv_tc", "site_baq_bv");
punch("emp_ap_tc", "site_baq_ap");
const kept = db.prepare("SELECT COUNT(*) AS n FROM punches WHERE site_id IN ('site_baq_ap','site_baq_bv')").get().n;
assert.equal(kept, 2);
assert.equal(integrityReport().ok, true, "partimos con integridad correcta");

// Una persona REAL (cédula de verdad) cargada por error en una tienda de demostración (R02).
const real = S.listEmployeeTypes().length ? listEmployees().find((e) => e.id === "emp_luis") : null;
db.prepare("UPDATE employees SET document_id = ? WHERE id = ?").run("1143132708", real.id);

// ── Permisos y validaciones
await rejects(purgeStores({ keep: KEEP, execute: false }, { ...root, role: "zone_manager" }), "FORBIDDEN");
await rejects(purgeStores({ keep: KEEP, execute: true }, { ...root, via: "api_key" }), "FORBIDDEN");
await rejects(purgeStores({ keep: [], execute: false }, root));
await rejects(purgeStores({ keep: ["no-existe"], execute: false }, root), "NOT_FOUND");

// ── Candado: no borra a una persona con cédula real, ni siquiera en la vista previa
await rejects(purgeStores({ keep: KEEP, execute: false }, root), "REAL_PEOPLE");
await rejects(purgeStores({ keep: KEEP, execute: true }, root), "REAL_PEOPLE");
assert.equal(listSites().length, 5, "nada se borró");

// ── Se mueve a esa persona a una tienda que se conserva
patchEmployee("emp_luis", { siteId: "site_baq_ap" });
assert.equal(getEmployee("emp_luis").siteId, "site_baq_ap");

// ── Vista previa: cuenta y no escribe
const plan = await purgeStores({ keep: KEEP, execute: false }, root);
assert.equal(plan.executed, false);
assert.deepEqual(plan.keep.map((s) => s.id).sort(), [...KEEP].sort());
assert.deepEqual(plan.remove.map((s) => s.code).sort(), ["CTG-01", "R01", "R02"]);
assert.equal(plan.counts.sites, 3);
assert.equal(plan.counts.punches, 5, "las 5 marcas hechas en R01, R02 y CTG-01 (incluida la de emp_luis, hoy conservado)");
assert.equal(listSites().length, 5, "la vista previa no borra");

// ── Ejecución
const before = db.prepare("SELECT COUNT(*) AS n FROM events").get().n;
const done = await purgeStores({ keep: KEEP, execute: true }, root);
assert.equal(done.executed, true);
assert.ok(existsSync(done.backup), "se hizo el respaldo antes de borrar");
assert.deepEqual(listSites().map((s) => s.id).sort(), [...KEEP].sort());
const left = listEmployees(undefined, { includeDeleted: true });
assert.ok(left.every((e) => KEEP.includes(e.siteId)), "solo quedan personas de las tiendas conservadas");
assert.ok(left.some((e) => e.id === "emp_luis"), "la persona movida se conserva");
assert.equal(db.prepare("SELECT COUNT(*) AS n FROM punches WHERE site_id IN ('site_baq_ap','site_baq_bv')").get().n, 2, "las marcas de lo conservado siguen");
assert.equal(db.prepare("SELECT COUNT(*) AS n FROM punches WHERE site_id NOT IN ('site_baq_ap','site_baq_bv')").get().n, 0);
for (const t of ["face_templates", "schedules", "contracts", "exceptions", "alerts", "enrollment_audit"]) {
  assert.equal(db.prepare(`SELECT COUNT(*) AS n FROM ${t} WHERE employee_id NOT IN (SELECT id FROM employees)`).get().n, 0, `${t} sin huérfanos`);
}

// ── La auditoría se conserva, suma un evento sellado y la integridad sigue correcta
assert.ok(db.prepare("SELECT COUNT(*) AS n FROM events").get().n > before, "los eventos no se borran");
const ev = db.prepare("SELECT payload FROM events WHERE type = 'data.purged'").get();
const payload = JSON.parse(ev.payload);
assert.equal(payload.by, "admin@test");
assert.deepEqual(payload.keptSites.sort(), ["BAQ-AP", "BAQ-BV"].sort());
assert.equal(payload.otherPunchIds.length, 2, "la marca sin empleado y la de emp_luis (conservado) en R02");
const integrity = integrityReport();
assert.equal(integrity.chain.ok, true);
assert.deepEqual(integrity.punches.mismatches, [], "lo purgado a propósito no cuenta como alterado");
assert.equal(integrity.ok, true);

// ── Control negativo: borrar a mano una marca conservada SÍ se detecta
db.prepare("DELETE FROM punches WHERE site_id = 'site_baq_bv'").run();
const tampered = integrityReport();
assert.equal(tampered.ok, false);
assert.equal(tampered.punches.mismatches[0].problem, "missing");

// ── Repetir no hace nada
const again = await purgeStores({ keep: KEEP, execute: true }, root);
assert.equal(again.executed, false);
assert.equal(again.remove.length, 0);

console.log("purge.test.mjs ok");
