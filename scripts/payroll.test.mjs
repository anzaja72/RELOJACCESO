import assert from "node:assert/strict";
import {
  dayTotals,
  daysOfMonth,
  hmToMin,
  summarizeMonth,
  workedIntervals,
} from "../src/lib/payroll.ts";

// America/Bogota es UTC-5 todo el año.
const B = "-05:00";
const cfg = {
  holidays: ["2026-10-12"],
  nightStartMin: 19 * 60,
  nightEndMin: 6 * 60,
  multDay: 1.25,
  multNight: 1.75,
  multHoliday: 2.0,
};
const daySched = { startMin: 7 * 60, endMin: 16 * 60, breakMin: 60 };
const nightSched = { startMin: 22 * 60, endMin: 6 * 60, breakMin: 60 };
const inMonth = (day) => day >= "2026-10-01" && day <= "2026-10-31";
const p = (type, iso) => ({
  type,
  capturedAt: iso,
  decision: "matched",
  employeeId: "e1",
  siteId: "s1",
});

assert.equal(hmToMin("07:30"), 450);
assert.equal(daysOfMonth("2026-02").length, 28);
assert.equal(daysOfMonth("2026-10").length, 31);

// 1) Jornada simple 07:00–16:00 = 540 min
{
  const iv = workedIntervals([
    p("IN", `2026-10-05T07:00:00${B}`),
    p("OUT", `2026-10-05T16:00:00${B}`),
  ]);
  assert.equal(dayTotals("2026-10-05", iv).workedMin, 540);
}

// 2) Pausa descontada sola: 07–12 + 13–17 = 540 min
{
  const iv = workedIntervals([
    p("IN", `2026-10-05T07:00:00${B}`),
    p("BREAK_START", `2026-10-05T12:00:00${B}`),
    p("BREAK_END", `2026-10-05T13:00:00${B}`),
    p("OUT", `2026-10-05T17:00:00${B}`),
  ]);
  assert.equal(dayTotals("2026-10-05", iv).workedMin, 540);
}

// 3) Sin OUT: cerrado en el fin de jornada (16:00)
{
  const iv = workedIntervals([p("IN", `2026-10-05T07:00:00${B}`)]);
  const capped = [
    { from: iv[0].from, to: `2026-10-05T16:00:00${B}` },
  ];
  assert.equal(dayTotals("2026-10-05", capped).workedMin, 540);
}

// 4) summarizeMonth: ordinarias vs extra diurna con valor
{
  const punches = [
    p("IN", `2026-10-05T07:00:00${B}`),
    p("OUT", `2026-10-05T17:00:00${B}`),
  ];
  const r = summarizeMonth({
    month: "2026-10",
    punches,
    scheduleFor: (d) => (inMonth(d) ? daySched : null),
    contract: { monthlySalary: 2_000_000, weeklyHours: 48 },
    cfg,
  });
  // plan = 540-60 = 480; trabajado = 600 → extra 2h diurnas
  assert.equal(r.ordinaryHours, 8);
  assert.equal(r.extraDayHours, 2);
  assert.equal(r.extraNightHours, 0);
  assert.equal(r.extraHolidayHours, 0);
  const rate = 2_000_000 / (48 * 5); // valor hora = sueldo / (horas semanales × 5)
  assert.ok(Math.abs(r.hourlyRate - rate) < 0.01);
  assert.equal(r.ordinaryValue, 2_000_000); // sueldo base: referencia, no suma al total
  assert.ok(Math.abs(r.extraDayValue - 2 * rate * 1.25) < 1);
  assert.equal(r.totalValue, r.surchargeValue + r.extraDayValue + r.extraNightValue + r.extraHolidayValue);
  assert.ok(Object.keys(r.weeklyHours).length >= 1);
}

// 5) Extra cruza la noche: OUT 20:00 → 60 min nocturnas + 240 diurnas
{
  const punches = [
    p("IN", `2026-10-05T07:00:00${B}`),
    p("OUT", `2026-10-05T20:00:00${B}`),
  ];
  const r = summarizeMonth({
    month: "2026-10",
    punches,
    scheduleFor: (d) => (inMonth(d) ? daySched : null),
    contract: { monthlySalary: 2_000_000, weeklyHours: 48 },
    cfg,
  });
  assert.equal(r.extraNightHours, 1);
  assert.equal(r.extraDayHours, 4);
}

// 6) Festivo: todo el extra va a recargo festivo
{
  const punches = [
    p("IN", `2026-10-12T07:00:00${B}`),
    p("OUT", `2026-10-12T17:00:00${B}`),
  ];
  const r = summarizeMonth({
    month: "2026-10",
    punches,
    scheduleFor: (d) => (inMonth(d) ? daySched : null),
    contract: { monthlySalary: 2_000_000, weeklyHours: 48 },
    cfg,
  });
  assert.equal(r.extraHolidayHours, 2);
  assert.equal(r.extraDayHours, 0);
}

// 7) Turno nocturno cruza medianoche: dos noches 22:00→06:00 con pausa planificada de 60
//    Cada turno cuenta en el día en que empieza: 480 min trabajados vs 420 pagados → 60 min extra por turno
{
  const punches = [
    p("IN", `2026-10-04T22:00:00${B}`),
    p("OUT", `2026-10-05T06:00:00${B}`),
    p("IN", `2026-10-05T22:00:00${B}`),
    p("OUT", `2026-10-06T06:00:00${B}`),
  ];
  const r = summarizeMonth({
    month: "2026-10",
    punches,
    scheduleFor: (d) => (inMonth(d) ? nightSched : null),
    contract: { monthlySalary: 2_000_000, weeklyHours: 48 },
    cfg,
  });
  assert.ok(Math.abs(r.workedHours - 16) < 0.02, `worked ${r.workedHours}`);
  assert.ok(Math.abs(r.extraNightHours - 2) < 0.02, `night ${r.extraNightHours}`);
  assert.ok(Math.abs(r.ordinaryHours - 14) < 0.02, `ordinary ${r.ordinaryHours}`);
}

// 8) Punch no identificado se ignora
{
  const iv = workedIntervals([
    { ...p("IN", `2026-10-05T07:00:00${B}`), decision: "unknown" },
    p("OUT", `2026-10-05T16:00:00${B}`),
  ]);
  assert.equal(iv.length, 0);
}

console.log("payroll.test.mjs ok");
