import assert from "node:assert/strict";
import {
  cellMinutes,
  coverageGaps,
  mondayOf,
  totalsByEmployee,
  validateCell,
  weekDates,
} from "@/lib/planning";

assert.equal(mondayOf("2026-11-19"), "2026-11-16");
assert.equal(mondayOf("2026-11-16"), "2026-11-16");
assert.equal(mondayOf("2026-11-22"), "2026-11-16"); // domingo
assert.deepEqual(weekDates("2026-12-28").slice(-3), ["2027-01-01", "2027-01-02", "2027-01-03"]);

const shift = (employeeId, date, startHm, endHm, lunchMin = 30) => ({ employeeId, date, kind: "turno", startHm, endHm, lunchMin });

// CP-03: el descanso no cuenta como turno trabajado; el total excluye el almuerzo.
assert.equal(cellMinutes(shift("a", "2026-11-16", "08:00", "16:30")), 480);
assert.equal(cellMinutes({ employeeId: "a", date: "2026-11-17", kind: "descanso" }), 0);
assert.equal(cellMinutes({ employeeId: "a", date: "2026-11-18", kind: "novedad" }), 0);
assert.equal(cellMinutes(shift("a", "2026-11-16", "22:00", "06:00", 30)), 450); // cruza medianoche

const week = weekDates("2026-11-16");
const cells = [
  ...week.slice(0, 6).map((d) => shift("ana", d, "08:00", "16:30")),
  { employeeId: "ana", date: week[6], kind: "descanso" },
];
assert.equal(totalsByEmployee(cells).ana, 6 * 480); // 48 h netas → exceso sobre 42 h

assert.deepEqual(validateCell(shift("a", "2026-11-16", "08:00", "16:30")), []);
assert.ok(validateCell(shift("a", "2026-11-16", "8:00", "16:30")).length > 0);
assert.ok(validateCell(shift("a", "2026-11-16", "08:00", "08:20", 30)).length > 0);
assert.ok(validateCell({ employeeId: "a", date: "x", kind: "turno" }).length > 0);

// CP-04: cobertura de responsable durante la apertura (07:00-22:00).
const leads = new Set(["coord", "gerente"]);
const day = "2026-11-16";
const covered = [shift("gerente", day, "07:00", "15:00"), shift("coord", day, "14:00", "22:00"), shift("cajero", day, "07:00", "22:00")];
assert.deepEqual(coverageGaps({ dates: [day], opensHm: "07:00", closesHm: "22:00", cells: covered, leadIds: leads }), []);

// Se elimina el único coordinador de la tarde → franja 15:00-22:00 sin responsable (aunque haya cajero).
const withoutCoord = covered.filter((c) => c.employeeId !== "coord");
assert.deepEqual(
  coverageGaps({ dates: [day], opensHm: "07:00", closesHm: "22:00", cells: withoutCoord, leadIds: leads }),
  [{ date: day, fromHm: "15:00", toHm: "22:00" }],
);

// Hueco intermedio y día sin nadie.
const middle = [shift("gerente", day, "07:00", "11:00"), shift("coord", day, "13:00", "22:00")];
assert.deepEqual(
  coverageGaps({ dates: [day, "2026-11-17"], opensHm: "07:00", closesHm: "22:00", cells: middle, leadIds: leads }),
  [
    { date: day, fromHm: "11:00", toHm: "13:00" },
    { date: "2026-11-17", fromHm: "07:00", toHm: "22:00" },
  ],
);

// Un responsable en descanso o novedad no cubre.
const resting = [{ employeeId: "gerente", date: day, kind: "descanso" }];
assert.equal(coverageGaps({ dates: [day], opensHm: "07:00", closesHm: "22:00", cells: resting, leadIds: leads }).length, 1);

console.log("planning.test.mjs ok");
