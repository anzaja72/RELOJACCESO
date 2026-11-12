// Simula las marcaciones del kiosco SIN cámara, para probar horas, almuerzo y excepciones.
// Envía exactamente lo que enviaría el kiosco (la «entrada» tras el almuerzo se manda como IN
// y el servidor la reclasifica como regreso de almuerzo).
//
// Uso (la contraseña va en el entorno, nunca en la línea de comandos):
//   BASE=http://localhost:47321 PASSWORD='…' node scripts/simular-marcas.mjs \
//     --usuario buenavista@reloj.cr --empleado emp_bv_tc --tienda BAQ-BV \
//     --marcas IN@08:00,BREAK_START@12:00,IN@12:30,OUT@16:30 [--dia 2026-11-16] [--dias 1]
//
//   Corregir una marca (requiere gerente o superior):
//   BASE=… PASSWORD='…' node scripts/simular-marcas.mjs --usuario ivan@reloj.cr \
//     --corregir <idDeLaMarca> --nueva-hora 12:32 --dia 2026-11-16 --motivo "Marcó tarde"
//
// Tipos de marca: IN (entrada), BREAK_START (salida a almuerzo), OUT (salida de trabajo).
// Solo para instancias de PRUEBA: contra un servidor remoto exige ALLOW_REMOTE=1.
import { ulid } from "ulidx";

const arg = (name) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : undefined;
};
const fail = (msg) => {
  console.error(`✗ ${msg}`);
  process.exit(1);
};

const BASE = (process.env.BASE || "http://localhost:47321").replace(/\/$/, "");
const PASSWORD = process.env.PASSWORD || process.env.ADMIN_PASSWORD;
const local = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(BASE);
if (!local && process.env.ALLOW_REMOTE !== "1") {
  fail(`BASE=${BASE} no es local. Este script escribe datos de prueba; use una instancia de pruebas (o ALLOW_REMOTE=1 bajo su responsabilidad).`);
}
if (!PASSWORD) fail("Defina PASSWORD en el entorno.");
const usuario = arg("usuario");
if (!usuario) fail("Falta --usuario (correo con el que se inicia sesión).");

const mondayOfToday = () => {
  const d = new Date();
  const local = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  local.setUTCDate(local.getUTCDate() - ((local.getUTCDay() + 6) % 7));
  return local.toISOString().slice(0, 10);
};
const dia = arg("dia") ?? mondayOfToday();
if (!/^\d{4}-\d{2}-\d{2}$/.test(dia)) fail("--dia debe ser AAAA-MM-DD");
const addDays = (date, n) => {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
// Colombia no tiene horario de verano: UTC-5 todo el año.
const iso = (date, hm) => {
  if (!/^\d{2}:\d{2}$/.test(hm)) fail(`Hora inválida '${hm}': use HH:MM`);
  return new Date(`${date}T${hm}:00-05:00`).toISOString();
};

async function call(method, route, token, body) {
  const res = await fetch(BASE + route, {
    method,
    headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
}

const login = await call("POST", "/api/v1/auth/login", null, { email: usuario, password: PASSWORD });
if (!login.data.token) fail(`No se pudo iniciar sesión como ${usuario} (${login.status} ${login.data.error ?? ""}).`);
const token = login.data.token;
console.log(`Sesión: ${usuario} (${login.data.user.role})`);

const LABEL = { IN: "Entrada", BREAK_START: "Salida a almuerzo", BREAK_END: "Regreso de almuerzo", OUT: "Salida de trabajo" };

// ── Corrección de una marca existente (CP-15)
const corregir = arg("corregir");
if (corregir) {
  const nueva = arg("nueva-hora");
  const motivo = arg("motivo") || "Corrección de prueba";
  if (!nueva) fail("Con --corregir indique --nueva-hora HH:MM (y --dia si no es el lunes de esta semana).");
  const r = await call("POST", "/api/v1/corrections", token, { punchId: corregir, reason: motivo, newTs: iso(dia, nueva) });
  if (r.status !== 201) fail(`Corrección rechazada (${r.status}): ${r.data.error ?? JSON.stringify(r.data)}`);
  const patch = JSON.parse(r.data.correction.patch);
  console.log(`✓ Corrección registrada. Valor original conservado: ${patch.previous.ts} (${patch.previous.type}) → ${patch.next.ts}`);
  process.exit(0);
}

// ── Marcaciones
const empleado = arg("empleado");
const tienda = arg("tienda");
const marcas = arg("marcas");
if (!empleado || !tienda || !marcas) fail("Faltan --empleado, --tienda y --marcas (ej. IN@08:00,OUT@16:30).");
const dias = Number(arg("dias") ?? 1);
if (!Number.isInteger(dias) || dias < 1 || dias > 7) fail("--dias debe estar entre 1 y 7.");
const lista = marcas.split(",").map((m) => m.trim().split("@"));
for (const [type, hm] of lista) {
  if (!["IN", "BREAK_START", "BREAK_END", "OUT"].includes(type) || !hm) fail(`Marca inválida '${type}@${hm}': use TIPO@HH:MM`);
}

let rechazadas = 0;
for (let d = 0; d < dias; d += 1) {
  const fecha = addDays(dia, d);
  console.log(`\n${fecha}`);
  for (const [type, hm] of lista) {
    const body = {
      id: ulid(),
      employeeId: empleado,
      siteId: tienda,
      type,
      capturedAt: iso(fecha, hm),
      terminalId: "SIMULADOR",
      matchScore: 0.3,
      decision: "matched",
      livenessHint: "pass",
    };
    const r = await call("POST", "/api/punches", token, body);
    if (r.status >= 400) {
      rechazadas += 1;
      console.log(`  ${hm}  ${LABEL[type]}: ✗ ${r.data.error ?? r.status}`);
      continue;
    }
    const p = r.data.punch;
    const nota = [
      p.type !== type ? `registrada como ${LABEL[p.type]}` : null,
      r.data.exception ? `EXCEPCIÓN ${r.data.exception.status} (${r.data.exception.type})` : null,
      p.decision === "duplicate" ? "duplicada (ya existía una marca igual hace poco)" : null,
    ].filter(Boolean);
    console.log(`  ${hm}  ${LABEL[type]}: ✓ id ${p.id}${nota.length ? ` · ${nota.join(" · ")}` : ""}`);
  }
}
if (rechazadas) process.exit(2);
