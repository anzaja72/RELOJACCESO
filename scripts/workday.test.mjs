import assert from "node:assert/strict";
import { computeWorkday, localDateTime } from "@/lib/workday";

// Barranquilla (America/Bogota, UTC-5) — 2026-11-16 es lunes.
const TZ = "America/Bogota";
const at = (hm) => `2026-11-16T${hm}:00-05:00`;
let n = 0;
const p = (type, hm) => ({ id: `p${++n}`, type, capturedAt: at(hm) });

assert.deepEqual(localDateTime("2026-11-17T03:30:00Z", TZ), { date: "2026-11-16", hm: "22:30", min: 1350 });

// CP-07 / RF-08: 08:00-12:00, almuerzo 12:00-12:30, 12:30-16:30 = 8 h netas.
const full = computeWorkday([p("OUT", "16:30"), p("IN", "08:00"), p("BREAK_END", "12:30"), p("BREAK_START", "12:00")], TZ);
assert.equal(full.workedMin, 480);
assert.equal(full.lunchMin, 30);
assert.equal(full.lunchDiffMin, 0);
assert.deepEqual(full.incidents, []);
assert.deepEqual([full.firstIn, full.lunchOut, full.lunchIn, full.lastOut], ["08:00", "12:00", "12:30", "16:30"]);

// RF-08: regreso tardío → se conserva lo real y se marca diferencia, sin fabricar marcas.
const late = computeWorkday([p("IN", "08:00"), p("BREAK_START", "12:00"), p("BREAK_END", "12:45"), p("OUT", "16:30")], TZ);
assert.equal(late.workedMin, 465);
assert.equal(late.lunchDiffMin, 15);
assert.ok(late.incidents.includes("almuerzo_diferente"));

// CP-08: sin marcas de almuerzo → incidencia y cálculo no inventado (tiempo real 08:00-16:30).
const noLunch = computeWorkday([p("IN", "08:00"), p("OUT", "16:30")], TZ);
assert.equal(noLunch.workedMin, 510);
assert.equal(noLunch.lunchMin, null);
assert.ok(noLunch.incidents.includes("almuerzo_ausente"));

// CP-06: salida a almuerzo sin regreso → no es fin de jornada; queda incompleto.
const onLunch = computeWorkday([p("IN", "08:00"), p("BREAK_START", "12:00")], TZ);
assert.equal(onLunch.workedMin, 240);
assert.equal(onLunch.lastOut, null);
assert.ok(onLunch.incidents.includes("almuerzo_incompleto"));

// Jornada abierta: sin salida.
const open = computeWorkday([p("IN", "08:00")], TZ);
assert.equal(open.workedMin, null);
assert.ok(open.incidents.includes("sin_salida"));

// Salida sin entrada.
assert.ok(computeWorkday([p("OUT", "16:00")], TZ).incidents.includes("sin_entrada"));

// Entrada doble: se cuenta desde la primera y se marca.
const twice = computeWorkday([p("IN", "08:00"), p("IN", "08:05"), p("OUT", "12:00")], TZ);
assert.equal(twice.workedMin, 240);
assert.ok(twice.incidents.includes("marca_repetida"));

assert.deepEqual(computeWorkday([], TZ).incidents, []);

console.log("workday.test.mjs ok");
