// Casos de liquidación revisables a mano. Parámetros de prueba (no son los oficiales):
// SMMLV = 1.000.000 y auxilio = 100.000 para que las cuentas sean fáciles de seguir.
import assert from "node:assert/strict";
import { liquidateMonth, LEGAL_DEFAULTS } from "../src/lib/payroll-co.ts";

const params = { ...LEGAL_DEFAULTS, smmlv: 1_000_000, auxTransporte: 100_000, offsetMin: -300 };
const base = (over = {}) => ({
  employeeId: "e1",
  contractStart: null,
  contractEnd: null,
  salaryHistory: [{ from: "2026-01-01", monthlySalary: 1_500_000, weeklyHours: 44 }],
  intervals: [],
  plannedMinFor: () => 480,
  novelties: [],
  ...over,
});
const amt = (r, code) => r.lines.find((l) => l.code === code)?.amount ?? 0;
// 07:00–16:00 hora de Bogotá = 12:00Z–21:00Z
const shift = (date, h1, h2) => ({ from: `${date}T${h1}:00Z`, to: `${date}T${h2}:00Z` });

// 1. Mes completo sin horas: salario + auxilio, 4 % + 4 %.
let r = liquidateMonth("2026-09", base(), params);
assert.deepEqual(r.blockers, []);
assert.equal(amt(r, "SAL"), 1_500_000);
assert.equal(amt(r, "AUX"), 100_000);
assert.equal(amt(r, "SALUD"), 60_000);
assert.equal(amt(r, "PENSION"), 60_000);
assert.equal(r.totals.neto, 1_480_000);
assert.equal(r.totals.ibc, 1_500_000);

// 2. Febrero paga 30 días comerciales, igual que un mes de 30.
r = liquidateMonth("2026-02", base(), params);
assert.equal(amt(r, "SAL"), 1_500_000);
// Un mes de 31 días también.
r = liquidateMonth("2026-08", base(), params);
assert.equal(amt(r, "SAL"), 1_500_000);

// 3. Ingreso a mitad de mes: 16 al 30 = 15 días.
r = liquidateMonth("2026-09", base({ contractStart: "2026-09-16" }), params);
assert.equal(amt(r, "SAL"), 750_000);
assert.equal(amt(r, "AUX"), 50_000);

// 4. Dos horas extra diurnas un miércoles: 2 × (1.500.000 / 220) × 1,25 = 17.045
r = liquidateMonth("2026-09", base({ intervals: [shift("2026-09-02", "12:00", "22:00")] }), params);
assert.equal(amt(r, "EXT_DIA"), 17_045);
assert.equal(r.hours.ext_dia, 2);

// 5. Ocho horas ordinarias nocturnas (22:00–06:00): recargo 35 % → 8 × 6.818,18 × 0,35 = 19.091
r = liquidateMonth("2026-09", base({ intervals: [{ from: "2026-09-03T03:00:00Z", to: "2026-09-03T11:00:00Z" }] }), params);
assert.equal(amt(r, "ORD_NOCHE"), 19_091);

// 6. Domingo 6 de septiembre de 2026, 8 h ordinarias diurnas: recargo dominical 90 % → 49.091
r = liquidateMonth("2026-09", base({ intervals: [shift("2026-09-06", "12:00", "20:00")] }), params);
assert.equal(amt(r, "ORD_DOM_DIA"), 49_091);

// 7. Incapacidad común 3 días al 66,67 %: salario 27 días + 100.000
r = liquidateMonth("2026-09", base({ novelties: [{ type: "incapacidad_comun", from: "2026-09-10", to: "2026-09-12" }] }), params);
assert.equal(amt(r, "SAL"), 1_350_000);
assert.equal(amt(r, "NOV_INCAPACIDAD_COMUN"), 100_000);
assert.equal(amt(r, "AUX"), 90_000);

// 8. Sin SMMLV cargado no se liquida.
r = liquidateMonth("2026-09", base(), { ...params, smmlv: 0 });
assert.ok(r.blockers.length > 0);

// 9. Salario sobre 2 SMMLV: sin auxilio.
r = liquidateMonth("2026-09", base({ salaryHistory: [{ from: "2026-01-01", monthlySalary: 2_600_000, weeklyHours: 44 }] }), params);
assert.equal(amt(r, "AUX"), 0);

console.log("payroll-co.test.mjs ok");
