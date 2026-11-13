import assert from "node:assert/strict";
import { test } from "node:test";
import { parseCsv } from "./importar-empleados.mjs";
import { netMinutes, parseCell, validateSchedule } from "./importar-cronograma.mjs";

test("parseCell entiende turnos, descanso y celdas vacías", () => {
  assert.deepEqual(parseCell("8:00-16:00"), { kind: "turno", startHm: "08:00", endHm: "16:00" });
  assert.deepEqual(parseCell(" 20:00 – 04:00 "), { kind: "turno", startHm: "20:00", endHm: "04:00" });
  assert.deepEqual(parseCell("descanso"), { kind: "descanso" });
  assert.equal(parseCell(""), null);
  assert.equal(parseCell(undefined), null);
});

test("parseCell rechaza lo que no es una hora", () => {
  for (const bad of ["25:00-03:00", "8am-4pm", "08:00", "08:00-08:00", "libre", "08:60-10:00"]) assert.throws(() => parseCell(bad), undefined, bad);
});

test("netMinutes descuenta el almuerzo y cruza la medianoche", () => {
  assert.equal(netMinutes("08:00", "16:00", 60), 420);
  assert.equal(netMinutes("20:00", "04:00", 60), 420);
  assert.equal(netMinutes("12:00", "21:00", 36), 504);
});

test("validateSchedule: almuerzo por defecto 30 y errores con número de fila", () => {
  const ok = validateSchedule(parseCsv("cedula,nombre,lunes,martes,miercoles,jueves,viernes,sabado,domingo\n1143132708,ANA,08:00-16:00,DESCANSO,,,,,"));
  assert.deepEqual(ok.errors, []);
  assert.equal(ok.people[0].lunch, 30);
  assert.equal(ok.people[0].cells[0].cell.kind, "turno");
  assert.equal(ok.people[0].cells[2].cell, null);

  const csv = ["cedula,nombre,lunes,martes,almuerzo_min", "12,ANA,08:00-16:00,", "1043667132,LUIS,8am-4pm,,60", "1043667132,OTRO,,,", "1043667133,MARÍA,08:00-08:20,,30"].join("\n");
  const bad = validateSchedule(parseCsv(csv));
  assert.equal(bad.people.length, 0);
  assert.match(bad.errors[0], /fila 2: cédula inválida/);
  assert.match(bad.errors[1], /fila 3: lunes: «8am-4pm»/);
  assert.match(bad.errors[2], /fila 4: cédula repetida/);
  assert.match(bad.errors[3], /fila 5: lunes: el almuerzo cubre todo el turno/);
});
