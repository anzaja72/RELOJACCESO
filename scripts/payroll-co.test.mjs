// Casos revisables a mano. Sueldo 1.500.000 y 44 h/semana → valor hora 1.500.000 / 220 = 6.818,18
import assert from "node:assert/strict";
import { hoursToPay, LEGAL_DEFAULTS } from "../src/lib/payroll-co.ts";

const params = { ...LEGAL_DEFAULTS, extraHolidays: [], offsetMin: -300 };
const run = (over = {}) =>
  hoursToPay(
    { month: "2026-09", intervals: [], plannedMinFor: () => 480, monthlySalary: 1_500_000, weeklyHours: 44, ...over },
    params,
  );
// Hora de Bogotá → UTC (+5 h)
const iv = (date, h1, h2) => ({ from: `${date}T${h1}:00Z`, to: `${date}T${h2}:00Z` });

// 1. Sin marcaciones: nada que sumar.
let r = run();
assert.equal(r.hourlyRate, 6818.18);
assert.equal(r.toPay, 0);

// 2. Jornada normal 07:00–15:00 un miércoles: solo ordinarias diurnas, nada adicional.
r = run({ intervals: [iv("2026-09-02", "12:00", "20:00")] });
assert.equal(r.hours.ord_dia, 8);
assert.equal(r.additions, 0);

// 3. Dos horas extra diurnas: 2 × 6.818,18 × 1,25 = 17.045
r = run({ intervals: [iv("2026-09-02", "12:00", "22:00")] });
assert.equal(r.values.ext_dia, 17_045);

// 4. Turno 22:00–06:00: ocho horas con recargo nocturno 35 % = 19.091
r = run({ intervals: [iv("2026-09-03", "03:00", "11:00")] });
assert.equal(r.hours.ord_noche, 8);
assert.equal(r.values.ord_noche, 19_091);

// 5. Domingo 6-sep-2026, 8 h ordinarias: recargo dominical 90 % = 49.091
r = run({ intervals: [iv("2026-09-06", "12:00", "20:00")] });
assert.equal(r.values.ord_dom_dia, 49_091);

// 6. Festivo (lunes 7-sep-2026 no lo es; lunes 17-ago-2026 sí, Asunción trasladada): 8 h
r = run({ month: "2026-08", intervals: [iv("2026-08-17", "12:00", "20:00")] });
assert.equal(r.hours.ord_dom_dia, 8);

// 7. Ausencia injustificada: 2 días × 50.000 = 100.000 menos.
r = run({ unjustifiedAbsenceDays: 2 });
assert.equal(r.absenceDiscount, 100_000);
assert.equal(r.toPay, -100_000);

// 8. Antes del 25-dic-2025 la noche empezaba a las 21:00: 19:00–21:00 no es nocturna.
r = hoursToPay(
  { month: "2025-11", intervals: [iv("2025-11-06", "00:00", "02:00")], plannedMinFor: () => 480, monthlySalary: 1_500_000, weeklyHours: 44 },
  params,
);
assert.equal(r.hours.ord_noche, 0); // 19:00–21:00 locales
assert.equal(r.hours.ord_dia, 2);

// 9. Sin contrato: no valora.
assert.ok(run({ monthlySalary: 0 }).blockers.length > 0);

console.log("payroll-co.test.mjs ok");
