// Carga empleados de una tienda desde un CSV usando la API de Reloj CR (no toca la base directamente):
// respeta permisos, validaciones y auditoría, y es repetible (omite a quien ya existe).
//
//   Simulación (no escribe nada):
//     BASE=https://reloj.leia-softwarelab.tech PASSWORD='…' node scripts/importar-empleados.mjs \
//       --usuario rrhh@empresa.co --archivo trabajadores.csv --tienda AP-31760
//   Aplicar:  agregue --aplicar
//   Crear la tienda si no existe (solo superadmin):
//       --crear-tienda --nombre-tienda "Alto Prado Norte" --ciudad Barranquilla --region zone_caribe
//
// CSV (UTF-8, con encabezado): codigo,cedula,nombre,cargo,tipo_jornada
//   · tipo_jornada debe coincidir con el nombre de un tipo de jornada de Reloj (ver /people › Tipos de jornada).
// La contraseña va SIEMPRE en el entorno (PASSWORD). Las cédulas se muestran enmascaradas.
import { readFileSync } from "node:fs";
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

  // Tienda
  const sites = (await call("GET", "sites", token)).data.sites ?? [];
  const wanted = tienda.toLowerCase();
  // Por id, por código o por parte del nombre (si es única): --tienda "Alto Prado"
  const byName = sites.filter((s) => s.name.toLowerCase().includes(wanted));
  let site = sites.find((s) => s.id.toLowerCase() === wanted || s.code.toLowerCase() === wanted) ?? (byName.length === 1 ? byName[0] : undefined);
  if (!site && byName.length > 1) fail(`«${tienda}» coincide con varias tiendas: ${byName.map((s) => `${s.name} (${s.code})`).join("; ")}. Use el código.`);
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
    if (!aplicar) console.log(`  · se crearía la tienda ${tienda} «${nombreTienda}» (${ciudad}, ${region})`);
    else {
      const created = await call("POST", "sites", token, { code: tienda.toUpperCase(), name: nombreTienda, city: ciudad, zoneId: region });
      if (created.status !== 201) fail(`No se pudo crear la tienda (${created.status}): ${created.data.error ?? ""}`);
      site = created.data.site;
      console.log(`  ✓ tienda creada: ${site.name} (${site.code})`);
    }
  } else {
    console.log(`Tienda: ${site.name} (${site.code}, ${site.city})`);
  }

  // Quién ya existe (por cédula o por código dentro de la tienda)
  const existing = (await call("GET", "employees", token, undefined)).data.employees ?? [];
  const docs = new Set(existing.filter((e) => e.documentId).map((e) => e.documentId));
  const codes = new Set(existing.filter((e) => site && e.siteId === site.id).map((e) => e.code.toUpperCase()));

  const counts = { creados: 0, omitidos: 0, errores: 0 };
  console.log("");
  for (const r of rows) {
    const label = `${r.codigo.padEnd(7)} ${mask(r.cedula).padEnd(12)} ${r.nombre.padEnd(38)} ${r.tipoNombre}`;
    if (docs.has(r.cedula) || (site && codes.has(r.codigo))) {
      console.log(`  = ya existe   ${label}`);
      counts.omitidos += 1;
      continue;
    }
    if (!aplicar || !site) {
      console.log(`  + se crearía  ${label}`);
      counts.creados += 1;
      continue;
    }
    const res = await call("POST", "employees", token, {
      name: r.nombre,
      code: r.codigo,
      siteId: site.id,
      role: r.cargo,
      documentId: r.cedula,
      employeeTypeId: r.tipoId,
      employmentStatus: "activo",
    });
    if (res.status === 201) {
      console.log(`  ✓ creado      ${label}`);
      counts.creados += 1;
    } else {
      console.log(`  ✗ ERROR       ${label} — ${res.data.error ?? res.status}`);
      counts.errores += 1;
    }
  }
  console.log(`\n${aplicar ? "Resultado" : "Resumen de la simulación"}: ${counts.creados} ${aplicar ? "creados" : "por crear"} · ${counts.omitidos} ya existían · ${counts.errores} con error`);
  if (!aplicar) console.log("Para cargarlos de verdad, repita el comando agregando --aplicar.");
  process.exit(counts.errores ? 2 : 0);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
