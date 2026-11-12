import assert from "node:assert/strict";
import { test } from "node:test";
import { parseCsv, validateRows } from "./importar-empleados.mjs";

const types = new Map([
  ["gerente junior", { id: "et_gj", name: "Gerente Junior" }],
  ["amigo bk", { id: "et_bk", name: "AMIGO BK" }],
]);

test("parseCsv respeta comillas, BOM, saltos CRLF y filas vacías", () => {
  const rows = parseCsv('﻿codigo,cedula,nombre,cargo\r\nAP-01,"1.143.132.708","PÉREZ, JUAN ""EL""",Gerente Junior\r\n\r\n');
  assert.equal(rows.length, 1);
  assert.equal(rows[0].nombre, 'PÉREZ, JUAN "EL"');
  assert.equal(rows[0].cedula, "1.143.132.708");
});

test("validateRows normaliza y acepta filas correctas", () => {
  const { rows, errors } = validateRows(parseCsv("codigo,cedula,nombre,cargo,tipo_jornada\nap-01,1.143.132.708,  ANA   LÓPEZ ,Gerente Junior,Gerente Junior"), types);
  assert.deepEqual(errors, []);
  assert.deepEqual(rows[0], { line: 2, codigo: "AP-01", cedula: "1143132708", nombre: "ANA LÓPEZ", cargo: "Gerente Junior", tipoId: "et_gj", tipoNombre: "Gerente Junior" });
});

test("el tipo de jornada cae en el cargo si la columna falta", () => {
  const { rows, errors } = validateRows(parseCsv("codigo,cedula,nombre,cargo\nAP-02,1043667132,LUIS DÍAZ,AMIGO BK"), types);
  assert.deepEqual(errors, []);
  assert.equal(rows[0].tipoId, "et_bk");
});

test("validateRows reporta cada problema con su número de fila y no deja pasar filas malas", () => {
  const csv = [
    "codigo,cedula,nombre,cargo",
    "AP-01,123,ANA,Gerente Junior", // cédula corta
    "AP-02,1043667132,LUIS DÍAZ,Cargo Inventado", // tipo inexistente
    "AP-03,1043667133,MARÍA RÍOS,Gerente Junior",
    "AP-03,1043667134,OTRA PERSONA,Gerente Junior", // código repetido
    "AP-05,1043667133,TERCERA,Gerente Junior", // cédula repetida
    "A,1043667135,,Gerente Junior", // código y nombre inválidos
  ].join("\n");
  const { rows, errors } = validateRows(parseCsv(csv), types);
  assert.equal(rows.length, 1, "solo la fila 4 es válida");
  assert.equal(rows[0].codigo, "AP-03");
  assert.equal(errors.length, 5);
  assert.match(errors[0], /fila 2: .*cédula inválida/);
  assert.match(errors[1], /fila 3: .*no existe en Reloj/);
  assert.match(errors.join("\n"), /código repetido/);
  assert.match(errors.join("\n"), /cédula repetida/);
  assert.match(errors.at(-1), /fila 7: código inválido; nombre vacío/);
});
