// Prueba la lógica de assets/cronograma.html con un cronograma de ejemplo: node scripts/validar.test.mjs
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const html = readFileSync(new URL("../assets/cronograma.html", import.meta.url), "utf8");
const logica = html.split("// ===LOGICA===")[1].split("\n").slice(1).join("\n").split("// ===FIN LOGICA===")[0];
const { analizar, leerCelda, hora } = new Function(`${logica}; return { analizar, leerCelda, hora };`)();
const datos = JSON.parse(readFileSync(new URL("./ejemplo-ver_cronograma.json", import.meta.url), "utf8"));

assert.equal(hora(26 * 60), "26");
assert.equal(hora(17 * 60 + 30), "17:30");
const noche = leerCelda("17:30-02:00 · almuerzo 30 min");
assert.equal(noche.fin, 26 * 60, "la salida de madrugada se escribe 26");
assert.equal(noche.neto, 8 * 60);
const partido = leerCelda("12:30-21:00 · almuerzo 90 min · partido 12:30-14:00 / 15:30-21:00");
assert.ok(partido.partido);
assert.equal(partido.neto, 7 * 60, "turno partido: 1,5 h + 5,5 h");

const a = analizar(datos);
const fila = (n) => a.filas.find((f) => f.e.nombre === n);
assert.equal(fila("LAURA PEREZ").neto, 42.5 * 60);
assert.equal(fila("LAURA PEREZ").malTotal, false, "42,5 h está dentro de la tolerancia de 30 min");
assert.equal(fila("CAMILO RUIZ").neto, 43.5 * 60, "3 noches de 8 h + 8 h + partido 7 h + 4,5 h");
assert.equal(fila("CAMILO RUIZ").malTotal, true, "43,5 h con jornada de 42 h se marca");
assert.ok(fila("ANA GOMEZ").celdas.every((c) => c.tipo === "novedad" && c.clase === "vac"), "vacaciones toda la semana");
assert.equal(fila("ANA GOMEZ").malTotal, false, "con vacaciones toda la semana no se le exigen horas");
assert.deepEqual(fila("PEDRO DIAZ").celdas.slice(0, 4).map((c) => c.clase), ["inc", "inc", "inc", "inc"]);
assert.equal(fila("PEDRO DIAZ").neto, 22 * 60);
const sofia = fila("SOFIA MORA");
assert.deepEqual(sofia.celdas.slice(5).map((c) => c.tipo), ["vacio", "vacio"], "sábado y domingo sin asignar");
assert.ok(a.problemas.some((p) => /SOFIA MORA: el sábado 14-11-2026 está sin asignar/.test(p)));
assert.ok(a.problemas.some((p) => /SOFIA MORA: 32 h programadas; su jornada pide 42 h/.test(p)));
assert.ok(a.problemas.some((p) => /Sin gerente ni coordinador el martes 10-11-2026 de 08:00-13:30/.test(p)));
assert.ok(a.avisos.some((p) => /4 días de turno/.test(p)), "las advertencias de Reloj se conservan");
assert.ok(!a.avisos.some((p) => /fuera del horario/.test(p)), "turnos hasta las 04:00 están dentro del horario 08:00–04:00");
assert.deepEqual(a.filas.map((f) => f.grupo), [0, 0, 1, 1, 2], "responsables primero, luego tiempo completo, luego el resto");
assert.equal(a.ok, false);
console.log(`ok · ${a.problemas.length} por corregir, ${a.avisos.length} para revisar`);
a.problemas.forEach((p) => console.log("  ✗", p));
a.avisos.forEach((p) => console.log("  ⚠", p));
