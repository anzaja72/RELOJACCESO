// Limpia los datos de DEMOSTRACIÓN: borra todas las tiendas que no se indiquen en --conservar, con sus empleados,
// marcaciones, cronogramas y demás datos dependientes. Lo ejecuta la app (hace respaldo, deja un evento sellado
// en la auditoría y nunca borra a una persona con cédula real). Solo superadmin, con usuario y contraseña.
//
//   Vista previa (no borra nada):
//     BASE=https://reloj.leia-softwarelab.tech PASSWORD='…' node scripts/limpiar-demo.mjs --usuario admin@reloj.cr --conservar AP,BV
//   Borrar: agregue --aplicar  (muestra qué se borrará y pide escribir BORRAR; --si lo omite)
import { createInterface } from "node:readline/promises";

const arg = (name) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : undefined;
};
const flag = (name) => process.argv.includes(`--${name}`);
const fail = (msg) => {
  console.error(`✗ ${msg}`);
  process.exit(1);
};

const BASE = (process.env.BASE || "http://localhost:47321").replace(/\/$/, "");
const PASSWORD = process.env.PASSWORD;
const usuario = arg("usuario");
const keep = (arg("conservar") || "").split(",").map((s) => s.trim()).filter(Boolean);
const aplicar = flag("aplicar");
if (!PASSWORD) fail("Defina PASSWORD en el entorno.");
if (!usuario) fail("Falta --usuario.");
if (!keep.length) fail("Indique las tiendas que se CONSERVAN: --conservar AP,BV (todo lo demás se borra).");

const call = async (method, route, token, body) => {
  const res = await fetch(`${BASE}/api/v1/${route}`, { method, headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
  return { status: res.status, data: await res.json().catch(() => ({})) };
};

console.log(`${aplicar ? "LIMPIEZA" : "VISTA PREVIA (no se borra nada)"} · ${BASE}`);
const login = await call("POST", "auth/login", null, { email: usuario, password: PASSWORD });
if (!login.data.token) fail(`No se pudo iniciar sesión como ${usuario} (${login.status}: ${login.data.error ?? ""}).`);
console.log(`Sesión: ${usuario} (${login.data.user.role})`);
const token = login.data.token;

const preview = await call("POST", "purge", token, { keep, execute: false });
if (preview.status !== 200) fail(`${preview.data.error ?? `HTTP ${preview.status}`}${preview.data.code === "REAL_PEOPLE" ? "\n  (Por seguridad la app no borra a nadie con cédula real: muévalos antes.)" : ""}`);
const p = preview.data;

console.log("\nSE CONSERVAN:");
p.keep.forEach((s) => console.log(`  ✓ ${s.code.padEnd(8)} ${s.name}`));
console.log("\nSE BORRAN:");
if (!p.remove.length) console.log("  (nada: ya solo existen las tiendas indicadas)");
p.remove.forEach((s) => console.log(`  ✗ ${s.code.padEnd(8)} ${s.name.padEnd(30)} ${s.city.padEnd(14)} ${String(s.employees).padStart(4)} empleados · ${String(s.punches).padStart(6)} marcaciones`));
const rest = Object.entries(p.counts).filter(([k]) => !["employees", "sites", "punches"].includes(k));
console.log(`\nTotal: ${p.counts.sites ?? 0} tiendas · ${p.employees} empleados · ${p.punches} marcaciones${rest.length ? " · " + rest.map(([k, v]) => `${v} de ${k}`).join(" · ") : ""}`);
if (p.orphanUsers.length) console.log(`⚠ Estos usuarios quedarán sin tienda (no se tocan): ${p.orphanUsers.join(", ")}`);
console.log("La auditoría, los usuarios, las regiones y los ajustes NO se borran.");

if (!p.remove.length) process.exit(0);
if (!aplicar) {
  console.log("\nVista previa: no se borró nada. Para ejecutarlo, repita el comando agregando --aplicar.");
  process.exit(0);
}
if (!flag("si")) {
  if (!process.stdin.isTTY) fail("No hay terminal interactiva para confirmar. Agregue --si si está seguro.");
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const answer = await rl.question(`\nVa a BORRAR ${p.counts.sites} tiendas y ${p.employees} empleados en ${BASE}. Se hará un respaldo antes.\nEscriba BORRAR para continuar: `);
  rl.close();
  if (answer.trim() !== "BORRAR") fail("Cancelado: no se borró nada.");
}

const done = await call("POST", "purge", token, { keep, execute: true, confirm: "BORRAR" });
if (done.status !== 200) fail(`${done.data.error ?? `HTTP ${done.status}`}`);
console.log(`\n✓ Limpieza hecha. Respaldo previo: ${done.data.backup}`);
console.log(`  Quedan: ${done.data.keep.map((s) => s.code).join(", ")}. La auditoría registró el evento «Datos de demostración eliminados».`);
