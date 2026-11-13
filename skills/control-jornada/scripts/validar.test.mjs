// Prueba la lógica de assets/jornada.html: node scripts/validar.test.mjs
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const html = readFileSync(new URL("../assets/jornada.html", import.meta.url), "utf8");
const logica = html.split("// ===LOGICA===")[1].split("\n").slice(1).join("\n").split("// ===FIN LOGICA===")[0];
const { analizarJornada } = new Function(`${logica}; return { analizarJornada };`)();
const a = analizarJornada(JSON.parse(readFileSync(new URL("./ejemplo-semanas.json", import.meta.url), "utf8")));
const de = (tipo, quien) => a.hallazgos.filter((h) => h.tipo === tipo && h.texto.startsWith(quien));
assert.equal(de("Más de la jornada", "LAURA PEREZ").length, 1);
assert.match(de("Más de la jornada", "LAURA PEREZ")[0].texto, /47:30 h, 5:30 sobre el máximo de 42:00 h — autorización pendiente/);
assert.equal(de("Tope de extras", "CAMILO RUIZ").length, 1, "14 h extra pasan el tope legal de 12");
assert.equal(de("Sin descanso semanal", "CAMILO RUIZ").length, 1);
assert.equal(de("Días de más de 9 h", "LAURA PEREZ").length, 1, "el lunes 9:30");
assert.equal(de("Dominical habitual", "LAURA PEREZ").length, 1, "3 domingos en noviembre (15, 22, 29)");
assert.equal(de("Dominical habitual", "CAMILO RUIZ").length, 0, "2 domingos no es habitual");
assert.equal(de("Más de la jornada", "CAMILO RUIZ").length, 1);
assert.equal(a.hallazgos[0].nivel, "bad", "primero lo grave");
assert.equal(a.graves, 4);
console.log(`ok · ${a.hallazgos.length} hallazgos, ${a.graves} graves`);
