// Carga empleados de una tienda desde un CSV usando la API de Reloj CR (no toca la base directamente):
// respeta permisos, validaciones y auditoría, y es repetible (omite a quien ya existe).
//
//   Simulación (no escribe nada):
//     BASE=https://reloj.leia-softwarelab.tech PASSWORD='…' node scripts/importar-empleados.mjs \
//       --usuario rrhh@empresa.co --archivo trabajadores.csv --tienda AP-31760
//   Aplicar:  agregue --aplicar  (pide escribir SI para confirmar; --si lo omite)
//   Pasar a una tienda a personas ya cargadas en otra: --mover
//   Crear la tienda si no existe (solo superadmin):
//       --crear-tienda --nombre-tienda "Alto Prado Norte" --ciudad Barranquilla --region zone_caribe
//
// CSV (UTF-8, con encabezado): codigo,cedula,nombre,cargo,tipo_jornada
//   · --tienda se busca SOLO por id, código o nombre completo (nunca por parte del nombre).
//   · tipo_jornada debe coincidir con el nombre de un tipo de jornada de Reloj (ver /people › Tipos de jornada).
// La contraseña va SIEMPRE en el entorno (PASSWORD). Las cédulas se muestran enmascaradas.
import { readFileSync } from "node:fs";
import { createInterface } from "node:readline/promises";
import { pathToFileURL } from "node:url";

/* ───────── CSV ───────── */
export function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;
  const src = text.replace(/^﻿/, "");
  for (let i = 0; i < src.length; i += 1) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"' && src[i + 1] === '"') {
        cell += '"';
        i += 1;
      } else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") {
      row.push(cell);
      cell = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && src[i + 1] === "\n") i += 1;
      row.push(cell);
      if (row.some((c) => c.trim() !== "")) rows.push(row);
      row = [];
      cell = "";
    } else cell += ch;
  }
  row.push(cell);
  if (row.some((c) => c.trim() !== "")) rows.push(row);
  const [header, ...body] = rows;
  const keys = header.map((h) => h.trim().toLowerCase());
  return body.map((r) => Object.fromEntries(keys.map((k, i) => [k, (r[i] ?? "").trim()])));
}

/** Valida y normaliza las filas. Devuelve { rows, errors }. */
export function validateRows(raw, typeByName) {
  const errors = [];
  const rows = [];
  const seenCode = new Set();
  const seenDoc = new Set();
  raw.forEach((r, i) => {
    const line = i + 2;
    const problems = [];
    const codigo = (r.codigo || "").toUpperCase();
    const cedula = (r.cedula || "").replace(/[.\s]/g, "");
    const nombre = (r.nombre || "").replace(/\s+/g, " ").trim();
    const cargo = r.cargo || "";
    const tipoNombre = r.tipo_jornada || cargo;
    if (!/^[A-Z0-9_-]{2,20}$/.test(codigo)) problems.push("código inválido");
    if (!/^\d{5,12}$/.test(cedula)) problems.push("cédula inválida (5 a 12 dígitos)");
    if (nombre.length < 3) problems.push("nombre vacío");
    if (!cargo) problems.push("cargo vacío");
    const tipo = typeByName.get(tipoNombre.toLowerCase());
    if (!tipo) problems.push(`tipo de jornada «${tipoNombre}» no existe en Reloj`);
    if (seenCode.has(codigo)) problems.push("código repetido en el archivo");
    if (seenDoc.has(cedula)) problems.push("cédula repetida en el archivo");
    seenCode.add(codigo);
    seenDoc.add(cedula);
    if (problems.length) errors.push(`fila ${line}: ${problems.join("; ")}`);
    else rows.push({ line, codigo, cedula, nombre, cargo, tipoId: tipo.id, tipoNombre: tipo.name });
  });
  return { rows, errors };
}

const norm = (t) => String(t ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();

/**
 * Busca una tienda por id, código o NOMBRE COMPLETO (sin tildes ni mayúsculas). Nunca por una parte del
 * nombre: «AP» no puede coincidir con «Café Central CHAPinero».
 */
export function findSite(sites, text) {
  const wanted = norm(text);
  return sites.find((s) => norm(s.id) === wanted || norm(s.code) === wanted || norm(s.name) === wanted);
}

const mask = (ced) => `${"•".repeat(Math.max(0, ced.length - 3))}${ced.slice(-3)}`;

/* ───────── Programa ───────── */
async function main() {
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
  const archivo = arg("archivo");
  const tienda = arg("tienda");
  const aplicar = flag("aplicar");
  if (!PASSWORD) fail("Defina PASSWORD en el entorno (la contraseña del usuario).");
  if (!usuario || !archivo || !tienda) fail("Faltan --usuario, --archivo y --tienda (código o id de la tienda).");

  const call = async (method, route, token, body) => {
    const res = await fetch(`${BASE}/api/v1/${route}`, {
      method,
      headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await res.json().catch(() => ({}));
    return { status: res.status, data };
  };

  console.log(`${aplicar ? "APLICANDO" : "SIMULACIÓN (no se escribe nada)"} · ${BASE}`);
  const login = await call("POST", "auth/login", null, { email: usuario, password: PASSWORD });
  if (!login.data.token) fail(`No se pudo iniciar sesión como ${usuario} (${login.status}: ${login.data.error ?? "sin detalle"}).`);
  const token = login.data.token;
  const role = login.data.user.role;
  console.log(`Sesión: ${usuario} (${role})`);

  const perms = (await call("GET", "permissions", token)).data.permissions ?? [];
  if (!perms.includes("employee.manage")) fail("Este usuario no puede crear empleados: use RR. HH. o un superadmin.");

  const types = (await call("GET", "employee-types", token)).data.types ?? [];
  const typeByName = new Map(types.map((t) => [t.name.toLowerCase(), t]));
  const { rows, errors } = validateRows(parseCsv(readFileSync(archivo, "utf8")), typeByName);
  if (errors.length) {
    console.error(`\nEl archivo tiene ${errors.length} problema(s):`);
    errors.forEach((e) => console.error(`  ✗ ${e}`));
    process.exit(1);
  }
  console.log(`Archivo: ${rows.length} trabajadores válidos`);

  // Tienda: solo coincidencia EXACTA (id, código o nombre completo)
  const sites = (await call("GET", "sites", token)).data.sites ?? [];
  const site = findSite(sites, tienda);
  let nueva = null;
  if (!site) {
    if (!flag("crear-tienda")) {
      console.error(`✗ No encontré la tienda «${tienda}». Tiendas que este usuario puede ver:`);
      sites.forEach((s) => console.error(`    ${s.code.padEnd(10)} ${s.name} · ${s.city} · id ${s.id}`));
      console.error("  Use el código de una de ellas, o --crear-tienda con --nombre-tienda, --ciudad y --region.");
      process.exit(1);
    }
    if (role !== "superadmin") fail("Solo el superadmin puede crear tiendas.");
    const nombreTienda = arg("nombre-tienda");
    const ciudad = arg("ciudad");
    const region = arg("region");
    if (!nombreTienda || !ciudad || !region) fail("Para crear la tienda indique --nombre-tienda, --ciudad y --region (id de región, ej. zone_caribe).");
    nueva = { code: tienda.toUpperCase(), name: nombreTienda, city: ciudad, zoneId: region };
    console.log(`Tienda NUEVA (se creará): ${nueva.name} (${nueva.code}, ${nueva.city}, ${nueva.zoneId})`);
  } else {
    console.log(`Tienda: ${site.name} (${site.code}, ${site.city})`);
  }
  const destino = site ? `${site.name} (${site.code})` : `${nueva.name} (${nueva.code}) [NUEVA]`;
  const siteName = (id) => sites.find((s) => s.id === id)?.name ?? id;

  // Qué haría con cada persona
  const existing = (await call("GET", "employees", token, undefined)).data.employees ?? [];
  const byDoc = new Map(existing.filter((e) => e.documentId).map((e) => [e.documentId, e]));
  const codesHere = new Set(existing.filter((e) => site && e.siteId === site.id).map((e) => e.code.toUpperCase()));
  const plan = rows.map((r) => {
    const prev = byDoc.get(r.cedula);
    if (prev) {
      if (site && prev.siteId === site.id) return { r, action: "omitir", note: "ya está en esta tienda" };
      return { r, prev, action: flag("mover") ? "mover" : "otra-tienda" };
    }
    if (codesHere.has(r.codigo)) return { r, action: "omitir", note: "el código ya existe en esta tienda" };
    return { r, action: "crear" };
  });

  console.log("");
  for (const { r, action, prev, note } of plan) {
    const label = `${r.codigo.padEnd(7)} ${mask(r.cedula).padEnd(12)} ${r.nombre.padEnd(38)} ${r.tipoNombre}`;
    const marca = { crear: "+ se crearía ", mover: "→ se movería ", omitir: "= se omite   ", "otra-tienda": "⚠ OTRA TIENDA" }[action];
    console.log(`  ${marca} ${label}${action === "mover" || action === "otra-tienda" ? `  (hoy en «${siteName(prev.siteId)}»)` : ""}${note ? `  (${note})` : ""}`);
  }
  const n = (a) => plan.filter((p) => p.action === a).length;
  console.log(`\nPlan: ${n("crear")} por crear · ${n("mover")} por mover · ${n("omitir")} se omiten · ${n("otra-tienda")} ya existen en OTRA tienda`);

  if (!aplicar) {
    if (n("otra-tienda")) console.log("⚠ Esas personas ya están cargadas en otra tienda. Para pasarlas a esta, agregue --mover.");
    console.log("Simulación: no se escribió nada. Para ejecutarlo, repita el comando agregando --aplicar.");
    return;
  }
  if (n("otra-tienda")) fail("Hay personas que ya existen en OTRA tienda (marcadas arriba). Si quiere pasarlas a esta, agregue --mover; si no, corrija el archivo.");

  // Confirmación explícita antes de escribir
  if (!flag("si")) {
    if (!process.stdin.isTTY) fail("No hay terminal interactiva para confirmar. Agregue --si si está seguro.");
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    const answer = await rl.question(`\nVa a ESCRIBIR en ${BASE}: ${n("crear")} crear y ${n("mover")} mover, en «${destino}».\nEscriba SI para continuar: `);
    rl.close();
    if (answer.trim().toUpperCase() !== "SI") fail("Cancelado: no se escribió nada.");
  }

  let target = site;
  if (nueva) {
    const created = await call("POST", "sites", token, nueva);
    if (created.status !== 201) fail(`No se pudo crear la tienda (${created.status}): ${created.data.error ?? ""}`);
    target = created.data.site;
    console.log(`  ✓ tienda creada: ${target.name} (${target.code})`);
  }

  const counts = { creados: 0, movidos: 0, omitidos: 0, errores: 0 };
  for (const { r, action, prev } of plan) {
    const label = `${r.codigo.padEnd(7)} ${mask(r.cedula).padEnd(12)} ${r.nombre.padEnd(38)} ${r.tipoNombre}`;
    if (action === "omitir") {
      console.log(`  = omitido     ${label}`);
      counts.omitidos += 1;
    } else if (action === "mover") {
      const res = await call("PATCH", `employees/${prev.id}`, token, { siteId: target.id });
      if (res.status === 200) {
        console.log(`  → movido      ${label}`);
        counts.movidos += 1;
      } else {
        console.log(`  ✗ ERROR       ${label} — ${res.data.error ?? res.status}`);
        counts.errores += 1;
      }
    } else {
      const res = await call("POST", "employees", token, { name: r.nombre, code: r.codigo, siteId: target.id, role: r.cargo, documentId: r.cedula, employeeTypeId: r.tipoId, employmentStatus: "activo" });
      if (res.status === 201) {
        console.log(`  ✓ creado      ${label}`);
        counts.creados += 1;
      } else {
        console.log(`  ✗ ERROR       ${label} — ${res.data.error ?? res.status}`);
        counts.errores += 1;
      }
    }
  }
  console.log(`\nResultado en «${target.name}»: ${counts.creados} creados · ${counts.movidos} movidos · ${counts.omitidos} omitidos · ${counts.errores} con error`);
  process.exit(counts.errores ? 2 : 0);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
