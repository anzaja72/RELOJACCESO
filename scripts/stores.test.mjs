/**
 * Casos de prueba CP-01 a CP-15 del documento «Requerimientos Ajustes Aplicación Tiendas»,
 * ejecutados contra el código real sobre una base SQLite temporal.
 */
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

process.env.DATA_DIR = mkdtempSync(path.join(tmpdir(), "reloj-stores-"));
const { createEmployee, getDb, getEmployee } = await import("@/lib/db");
const { insertCorrection, upsertContract } = await import("@/lib/db-ops");
const { seedTiendas } = await import("../scripts/seed-tiendas.mjs");
const S = await import("@/lib/stores");
seedTiendas(getDb(), { password: "prueba-no-productiva-1" });

const actor = (id, role, scopeType, scopeId) => ({ id, email: `${id}@test`, name: id, role, scopeType, scopeId });
const hr = actor("rrhh", "hr", "all", null);
const ivan = actor("ivan", "zone_manager", "zone", "zone_caribe");
const gerenteBV = actor("bv", "site_manager", "site", "site_baq_bv");
const gerenteAP = actor("ap", "site_manager", "site", "site_baq_ap");
const zonaGAM = actor("andina", "zone_manager", "zone", "zone_andina");

const forbidden = (fn) => assert.throws(fn, (e) => e instanceof S.DomainError && e.status === 403);
const WEEK = "2026-11-16"; // lunes
const days = ["2026-11-16", "2026-11-17", "2026-11-18", "2026-11-19", "2026-11-20", "2026-11-21", "2026-11-22"];
const iso = (date, hm) => new Date(`${date}T${hm}:00-05:00`).toISOString();
let seq = 0;
const punch = (employeeId, siteId, type, date, hm) =>
  S.ingestPunch({
    id: `01TEST${String(++seq).padStart(20, "0")}`,
    employeeId,
    siteId,
    type,
    capturedAt: iso(date, hm),
    terminalId: "T-test",
    matchScore: 0.3,
    decision: "matched",
    livenessHint: "pass",
  });

// ── CP-01: alta de empleado por RR. HH.; el regional ve solo lo permitido (sin salario).
const nuevo = createEmployee({ name: "Nuevo Empleado", code: "BV-099", siteId: "site_baq_bv", role: "Empleado General" });
S.updateEmployeeHr(nuevo.id, { documentId: "CC-99", employeeTypeId: "et_tc" }, hr);
upsertContract({ employeeId: nuevo.id, monthlySalary: 1_750_000, weeklyHours: 42 });
const ficha = getEmployee(nuevo.id);
assert.equal(ficha.employeeTypeId, "et_tc");
assert.equal(ficha.documentId, "CC-99");
// El salario vive en contratos (nómina) y solo lo ven los roles autorizados.
assert.equal(S.weeklyHours(hr, { weekStart: WEEK, employeeId: nuevo.id })[0].salary, 1_750_000);
assert.equal(S.weeklyHours(ivan, { weekStart: WEEK, employeeId: nuevo.id })[0].salary, null);
forbidden(() => S.updateEmployeeHr(nuevo.id, { documentId: "CC-100" }, ivan));
assert.throws(() => S.updateEmployeeHr(nuevo.id, { documentId: "DEMO-BV-001" }, hr), /ya existe/);
const sinFicha = createEmployee({ name: "Sin ficha", code: "BV-098", siteId: "site_baq_bv", role: "Empleado" });
assert.deepEqual(S.missingForPlanning(getEmployee(sinFicha.id)), ["identificación", "tipo de jornada"]);

// RF-02: tipos de jornada del anexo, parametrizables.
const types = Object.fromEntries(S.listEmployeeTypes().map((t) => [t.id, t]));
assert.equal(types.et_gj.weeklyHours, 42);
assert.equal(types.et_gj.daysPerWeek, 6);
assert.equal(types.et_bk.daysPerWeek, 5);
assert.equal(types.et_mt.minWeeklyHours, 21);
assert.equal(types.et_mt.variableDays, true);
forbidden(() => S.saveEmployeeType({ id: "et_gj", name: "Gerente Junior", daysPerWeek: 6, weeklyHours: 40 }, ivan));
assert.equal(S.saveEmployeeType({ ...types.et_gj, weeklyHours: 42 }, hr).weeklyHours, 42);

// ── CP-02: el regional ve Barranquilla y Cartagena; no ve Costa Rica.
const region = S.regionSummary(ivan, WEEK);
const cities = region.zones.flatMap((z) => z.cities.map((c) => c.city)).sort();
assert.deepEqual(cities, ["Barranquilla", "Cartagena"]);
assert.ok(!S.inScope(ivan, "site_r01"), "la región Andina no es de Iván");

// ── CP-03: el gerente crea la semana con descanso; el descanso no suma horas.
const plan = S.openPlan("site_baq_bv", WEEK, gerenteBV);
assert.equal(plan.status, "borrador");
const turno = (employeeId, date, startHm, endHm) => ({ employeeId, date, kind: "turno", startHm, endHm, lunchMin: 30 });
const cells = [];
for (const d of days.slice(0, 6)) {
  cells.push(turno("emp_bv_gj", d, "07:00", "15:00"));
  cells.push(turno("emp_bv_ct", d, "14:00", "22:00"));
}
cells.push({ employeeId: "emp_bv_gj", date: days[6], kind: "descanso" });
cells.push({ employeeId: "emp_bv_ct", date: days[6], kind: "descanso" });
let view = S.savePlanCells(plan.id, cells, gerenteBV);
assert.equal(view.totals.emp_bv_gj, 6 * 450);
assert.ok(view.coverage.every((g) => g.date === days[6]), "solo el domingo queda sin responsable");
assert.throws(() => S.savePlanCells(plan.id, [turno(sinFicha.id, days[0], "08:00", "16:00")], gerenteBV), /ficha incompleta/);
assert.throws(() => S.savePlanCells(plan.id, [turno("emp_ap_tc", days[0], "08:00", "16:00")], gerenteBV), /no pertenece/);

// ── CP-04: se elimina al único coordinador de la tarde → advertencia con franja.
view = S.savePlanCells(plan.id, [{ employeeId: "emp_bv_ct", date: days[0], kind: null }], gerenteBV);
assert.ok(view.coverage.some((g) => g.date === days[0] && g.fromHm === "15:00" && g.toHm === "22:00"));
view = S.savePlanCells(plan.id, [turno("emp_bv_ct", days[0], "14:00", "22:00")], gerenteBV);

// ── CP-05 / RF-05: enviar al gerente de zona; devolver exige observaciones; aprobar.
S.submitPlan(plan.id, gerenteBV);
assert.ok(S.regionSummary(ivan, WEEK).pending.plans.some((p) => p.planId === plan.id));
forbidden(() => S.decidePlan(plan.id, "aprobado", null, gerenteBV));
assert.throws(() => S.decidePlan(plan.id, "devuelto", "", ivan), /observaciones/);
S.decidePlan(plan.id, "devuelto", "Falta cubrir domingo", ivan);
assert.throws(() => S.decidePlan(plan.id, "aprobado", null, ivan), /enviado/);
S.submitPlan(plan.id, gerenteBV);
view = S.decidePlan(plan.id, "aprobado", "OK", ivan);
assert.equal(view.approved.id, plan.id);
assert.throws(() => S.savePlanCells(plan.id, cells.slice(0, 1), gerenteBV), /nueva versión/);
assert.throws(() => S.openPlan("site_baq_bv", WEEK, gerenteBV), /justificar/);
const v2 = S.openPlan("site_baq_bv", WEEK, gerenteBV, "Incapacidad de un cajero");
assert.equal(v2.version, 2);
assert.equal(S.getPlanView("site_baq_bv", WEEK, gerenteBV).approved.id, plan.id, "la vigente sigue siendo la aprobada");

// ── CP-14: un gerente no ve una tienda ajena; una zona no ve la otra.
forbidden(() => S.getPlanView("site_baq_ap", WEEK, gerenteBV));
forbidden(() => S.getPlanView("site_baq_bv", WEEK, zonaGAM));
forbidden(() => S.weeklyHours(gerenteBV, { weekStart: WEEK, siteId: "site_baq_ap" }));

// ── CP-06 / CP-07: Entrada, Salida→almuerzo, Entrada (regreso), Salida→fin = 8 h netas.
punch("emp_bv_tc", "site_baq_bv", "IN", days[0], "08:00");
punch("emp_bv_tc", "site_baq_bv", "BREAK_START", days[0], "12:00");
const back = punch("emp_bv_tc", "site_baq_bv", "IN", days[0], "12:30");
assert.equal(back.punch.type, "BREAK_END", "la entrada tras el almuerzo se clasifica como regreso");
punch("emp_bv_tc", "site_baq_bv", "OUT", days[0], "16:30");
let hours = S.weeklyHours(hr, { weekStart: WEEK, employeeId: "emp_bv_tc" })[0];
assert.equal(hours.days[0].workday.workedMin, 480);
assert.equal(hours.days[0].workday.lunchMin, 30);
assert.deepEqual(hours.days[0].workday.incidents, []);

// ── CP-08: sin marcas de almuerzo → incidencia, sin inventar la pausa.
punch("emp_bv_tc", "site_baq_bv", "IN", days[1], "08:00");
punch("emp_bv_tc", "site_baq_bv", "OUT", days[1], "16:30");
hours = S.weeklyHours(hr, { weekStart: WEEK, employeeId: "emp_bv_tc" })[0];
assert.equal(hours.days[1].workday.workedMin, 510);
assert.ok(hours.days[1].workday.incidents.includes("almuerzo_ausente"));
assert.equal(hours.pendingReview, true);

// ── CP-09: tiendas autorizadas por casilla; el regional solo gestiona sus tiendas.
forbidden(() => S.setStoreAccess({ employeeId: "emp_bv_bk", siteId: "site_baq_ap", enabled: true }, gerenteBV));
forbidden(() => S.setStoreAccess({ employeeId: "emp_bv_bk", siteId: "site_r01", enabled: true }, ivan));
S.setStoreAccess({ employeeId: "emp_bv_bk", siteId: "site_baq_ap", enabled: true }, ivan);
const gallery = S.kioskGallery("site_baq_ap");
assert.equal(gallery.employees.find((e) => e.id === "emp_bv_bk").authorized, true);
assert.equal(gallery.employees.find((e) => e.id === "emp_bv_tc").authorized, false);
assert.ok(!gallery.employees.some((e) => e.siteId === "site_r01"), "la galería no cruza zonas");
const ok = punch("emp_bv_bk", "site_baq_ap", "IN", days[2], "08:00");
assert.equal(ok.punch.storeAuthorized, true);
assert.equal(ok.exception, null);
S.setStoreAccess({ employeeId: "emp_bv_bk", siteId: "site_baq_ap", enabled: false }, ivan);
assert.equal(S.authorizedSiteIdsOn("emp_bv_bk", days[3]).has("site_baq_ap"), false);
const events = getDb().prepare("SELECT type FROM events WHERE type LIKE 'store_access.%'").all().map((r) => r.type);
assert.deepEqual(events, ["store_access.granted", "store_access.revoked"]);

// ── CP-10: movilidad Buenavista → Alto Prado, trazable, en el cronograma destino; la tienda base no cambia.
assert.throws(() => S.createMobility({ employeeId: "emp_bv_gj", toSiteId: "site_baq_ap", startDate: days[1], endDate: days[2], reason: "" }, ivan), /motivo/);
const mov = S.createMobility({ employeeId: "emp_bv_gj", toSiteId: "site_baq_ap", startDate: days[1], endDate: days[2], reason: "cobertura" }, ivan);
assert.equal(mov.fromSiteId, "site_baq_bv");
assert.equal(getEmployee("emp_bv_gj").siteId, "site_baq_bv");
const apView = S.getPlanView("site_baq_ap", WEEK, gerenteAP);
const guest = apView.employees.find((e) => e.id === "emp_bv_gj");
assert.deepEqual(guest.guestFrom.dates, [days[1], days[2]]);
const bvView = S.getPlanView("site_baq_bv", WEEK, gerenteBV, { planId: plan.id });
assert.deepEqual(bvView.employees.find((e) => e.id === "emp_bv_gj").awayDates.map((a) => a.date), [days[1], days[2]]);
assert.ok(bvView.coverage.some((g) => g.date === days[1] && g.fromHm === "07:00"), "la gerente movilizada deja de cubrir su tienda base");
const apPlan = S.openPlan("site_baq_ap", WEEK, gerenteAP);
S.savePlanCells(apPlan.id, [turno("emp_bv_gj", days[1], "07:00", "15:00")], gerenteAP);
assert.throws(() => S.savePlanCells(apPlan.id, [turno("emp_bv_gj", days[4], "07:00", "15:00")], gerenteAP), /fuera del período/);

// ── CP-11: marca en tienda no prevista → excepción urgente pendiente; decidir no borra la marca.
const rogue = punch("emp_ap_tc", "site_baq_bv", "IN", days[2], "09:00");
assert.equal(rogue.punch.storeAuthorized, false);
assert.equal(rogue.exception.kind, "urgente");
assert.equal(rogue.exception.status, "pendiente");
forbidden(() => S.decideNovelty(rogue.exception.id, "aprobada", "ok", gerenteBV));
assert.throws(() => S.decideNovelty(rogue.exception.id, "rechazada", "", ivan), /comentario/);
const decided = S.decideNovelty(rogue.exception.id, "aprobada", "Cubrió una urgencia", ivan);
assert.equal(decided.decidedBy, "ivan@test");
assert.ok(getDb().prepare("SELECT 1 FROM punches WHERE id = ?").get(rogue.punch.id), "la marcación se conserva");

// ── CP-12: exceso sobre la jornada de referencia → pendiente de revisión, sin liquidar.
for (const d of days.slice(0, 6)) {
  punch("emp_ap_bk", "site_baq_ap", "IN", d, "07:00");
  punch("emp_ap_bk", "site_baq_ap", "BREAK_START", d, "12:00");
  punch("emp_ap_bk", "site_baq_ap", "IN", d, "12:30");
  punch("emp_ap_bk", "site_baq_ap", "OUT", d, "16:00");
}
hours = S.weeklyHours(ivan, { weekStart: WEEK, employeeId: "emp_ap_bk" })[0];
assert.equal(hours.workedMin, 6 * 510);
assert.equal(hours.excessMin, 6 * 510 - 42 * 60);
assert.equal(hours.excessNovelty.status, "pendiente");
const excess = S.listNovelties(ivan, { kind: "exceso", employeeId: "emp_ap_bk" });
assert.equal(excess.length, 1, "un solo pendiente por semana, actualizado con cada salida");
assert.equal(excess[0].minutes, hours.excessMin);

// ── CP-13: vacaciones de la gerente → resaltadas y la cobertura se recalcula.
const before = S.getPlanView("site_baq_bv", WEEK, gerenteBV, { planId: plan.id }).coverage.length;
S.createNovelty({ kind: "programada", type: "vacaciones", employeeId: "emp_bv_gj", startDate: days[4], endDate: days[5], note: "Vacaciones" }, hr);
const withVac = S.getPlanView("site_baq_bv", WEEK, gerenteBV, { planId: plan.id });
assert.ok(withVac.novelties.some((n) => n.type === "vacaciones"));
assert.ok(withVac.coverage.length > before);
assert.ok(withVac.warnings.some((w) => /novedad o movilidad/.test(w.message)));

// ── CP-15: la corrección conserva el original (en `corrections`) y queda auditada, también encadenada.
const original = getDb().prepare("SELECT captured_at, type FROM punches WHERE id = ?").get(back.punch.id);
insertCorrection({ punchId: back.punch.id, reason: "Marcó tarde", requestedBy: "bv@test", approvedBy: "ivan@test", newTs: iso(days[0], "12:31") });
insertCorrection({ punchId: back.punch.id, reason: "Segundo ajuste", requestedBy: "bv@test", approvedBy: "ivan@test", newTs: iso(days[0], "12:32") });
const fixes = getDb().prepare("SELECT reason, patch FROM corrections WHERE punch_id = ? ORDER BY created_at, rowid").all(back.punch.id);
assert.equal(fixes.length, 2);
const first = JSON.parse(fixes[0].patch);
assert.equal(first.previous.ts, original.captured_at, "el valor original no se pierde");
assert.equal(first.previous.type, original.type);
assert.equal(JSON.parse(fixes[1].patch).previous.ts, iso(days[0], "12:31"));
assert.equal(getDb().prepare("SELECT captured_at FROM punches WHERE id = ?").get(back.punch.id).captured_at, iso(days[0], "12:32"));

// RF-16: bitácora con actor en las decisiones.
const decision = getDb().prepare("SELECT payload FROM events WHERE type = 'plan.decided' ORDER BY created_at DESC LIMIT 1").get();
assert.equal(JSON.parse(decision.payload).by, "ivan@test");
const hrEvent = JSON.parse(getDb().prepare("SELECT payload FROM events WHERE type = 'employee.hr_updated' LIMIT 1").get().payload);
assert.equal(hrEvent.by, "rrhh@test");
assert.equal(hrEvent.after.employeeTypeId, "et_tc");

// RF-06: el horario de apertura lo fija el regional y la cobertura lo usa.
forbidden(() => S.setSiteHours("site_baq_bv", "08:00", "20:00", gerenteBV));
assert.throws(() => S.setSiteHours("site_baq_bv", "20:00", "08:00", ivan), /posterior/);
S.setSiteHours("site_baq_bv", "08:00", "20:00", ivan);
const hoursView = S.getPlanView("site_baq_bv", WEEK, gerenteBV, { planId: plan.id });
assert.equal(hoursView.hoursConfirmed, true);
assert.ok(hoursView.coverage.every((g) => g.fromHm >= "08:00" && g.toHm <= "20:00"));

console.log("stores.test.mjs ok");
