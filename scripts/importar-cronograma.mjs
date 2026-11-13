// Carga el cronograma semanal de una tienda desde un CSV usando la API de Reloj CR.
// Deja el cronograma como BORRADOR (no lo envía ni lo aprueba, salvo --enviar). Por defecto solo simula.
//
//   Simulación:
//     BASE=https://reloj.leia-softwarelab.tech PASSWORD='…' node scripts/importar-cronograma.mjs \
//       --usuario ger@empresa.co --archivo cronograma.csv --tienda AP-31760 --semana 2026-11-16
//   Aplicar: agregue --aplicar      Enviarlo al regional además: --aplicar --enviar
//   Si ya hay uno aprobado/enviado, crea una nueva versión con:  --nueva-version "motivo del cambio"
//
// CSV (UTF-8, con encabezado): cedula,nombre,lunes,martes,miercoles,jueves,viernes,sabado,domingo,almuerzo_min
//   · cada día: «HH:MM-HH:MM» (turno; salida menor que entrada = cruza medianoche), «DESCANSO» o vacío (no toca).
//   · almuerzo_min (opcional, por defecto 30): minutos de almuerzo que no cuentan como trabajados.
//   · la persona se identifica por la cédula (debe estar cargada en Reloj); «nombre» es solo informativo.
// La contraseña va SIEMPRE en el entorno (PASSWORD). Las cédulas se muestran enmascaradas.
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { parseCsv } from "./importar-empleados.mjs";

const DAYS = ["lunes", "martes", "miercoles", "jueves", "viernes", "sabado", "domingo"];
const HM = /^([01]?\d|2[0-3]):([0-5]\d)$/;

const pad = (hm) => {
  const [h, m] = hm.split(":");
  return `${h.padStart(2, "0")}:${m}`;
};
const toMin = (hm) => {
  const [h, m] = hm.split(":").map(Number);
  return h * 60 + m;
};

/** Interpreta una celda de día: { kind: "turno", startHm, endHm } | { kind: "descanso" } | null (vacía). Lanza Error si es inválida. */
export function parseCell(raw) {
  const v = String(raw ?? "").trim();
  if (!v) return null;
  if (/^descanso$/i.test(v)) return { kind: "descanso" };
  const m = v.match(/^(\d{1,2}:\d{2})\s*[-–a]\s*(\d{1,2}:\d{2})$/i);
  if (!m || !HM.test(m[1]) || !HM.test(m[2])) throw new Error(`«${v}» no es HH:MM-HH:MM ni DESCANSO`);
  const startHm = pad(m[1]);
  const endHm = pad(m[2]);
  if (startHm === endHm) throw new Error(`«${v}»: entrada y salida iguales`);
  return { kind: "turno", startHm, endHm };
}

/** Minutos netos de un turno (sin almuerzo); la salida menor que la entrada cruza medianoche. */
export function netMinutes(startHm, endHm, lunchMin) {
  const span = toMin(endHm) - toMin(startHm);
  return (span > 0 ? span : span + 1440) - lunchMin;
}

export const fmtH = (min) => `${Math.floor(min / 60)}:${String(min % 60).padStart(2, "0")}`;

/** Valida las filas y devuelve { people, errors }. `people`: cédula, nombre, almuerzo y celdas por día. */
export function validateSchedule(raw) {
  const errors = [];
  const people = [];
  const seen = new Set();
  raw.forEach((r, i) => {
    const line = i + 2;
    const cedula = (r.cedula || "").replace(/[.\s]/g, "");
    const problems = [];
    if (!/^\d{5,12}$/.test(cedula)) problems.push("cédula inválida");
    if (seen.has(cedula)) problems.push("cédula repetida");
    seen.add(cedula);
    const lunch = r.almuerzo_min === undefined || r.almuerzo_min === "" ? 30 : Number(r.almuerzo_min);
    if (!Number.isInteger(lunch) || lunch < 0 || lunch > 180) problems.push("almuerzo_min debe estar entre 0 y 180");
    const cells = [];
    DAYS.forEach((day, d) => {
      try {
        const c = parseCell(r[day]);
        if (c?.kind === "turno" && Number.isInteger(lunch) && netMinutes(c.startHm, c.endHm, lunch) <= 0) throw new Error("el almuerzo cubre todo el turno");
        cells.push({ day, index: d, cell: c });
      } catch (e) {
        problems.push(`${day}: ${e.message}`);
      }
    });
    if (problems.length) errors.push(`fila ${line}: ${problems.join("; ")}`);
    else people.push({ line, cedula, nombre: (r.nombre || "").trim(), lunch, cells });
  });
  return { people, errors };
}

const mask = (ced) => `${"•".repeat(Math.max(0, ced.length - 3))}${ced.slice(-3)}`;
const mondayOf = (date) => {
  const d = new Date(`${date}T12:00:00Z`);
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== date) throw new Error(`Fecha inválida: ${date}`);
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
};
const addDays = (date, n) => {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

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
  const enviar = flag("enviar");
  const nuevaVersion = arg("nueva-version");
  if (!PASSWORD) fail("Defina PASSWORD en el entorno.");
  if (!usuario || !archivo || !tienda) fail("Faltan --usuario, --archivo y --tienda.");
  if (enviar && !aplicar) fail("--enviar requiere --aplicar.");
  let week;
  try {
    week = mondayOf(arg("semana") || new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota" }).format(new Date()));
  } catch (e) {
    fail(e.message);
  }

  const call = async (method, route, token, body, params) => {
    const url = new URL(`${BASE}/api/v1/${route}`);
    for (const [k, v] of Object.entries(params ?? {})) url.searchParams.set(k, String(v));
    const res = await fetch(url, { method, headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
    return { status: res.status, data: await res.json().catch(() => ({})) };
  };

  const { people, errors } = validateSchedule(parseCsv(readFileSync(archivo, "utf8")));
  if (errors.length) {
    console.error(`El archivo tiene ${errors.length} problema(s):`);
    errors.forEach((e) => console.error(`  ✗ ${e}`));
    process.exit(1);
  }

  console.log(`${aplicar ? "APLICANDO" : "SIMULACIÓN (no se escribe nada)"} · ${BASE} · semana del ${week}`);
  const login = await call("POST", "auth/login", null, { email: usuario, password: PASSWORD });
  if (!login.data.token) fail(`No se pudo iniciar sesión como ${usuario} (${login.status}: ${login.data.error ?? ""}).`);
  const token = login.data.token;
  console.log(`Sesión: ${usuario} (${login.data.user.role})`);
  const perms = (await call("GET", "permissions", token)).data.permissions ?? [];
  if (!perms.includes("plan.edit")) fail("Este usuario no puede editar cronogramas (gerente de tienda, regional o superadmin).");
  if (enviar && !perms.includes("plan.submit")) fail("Este usuario no puede enviar cronogramas.");

  const sites = (await call("GET", "sites", token)).data.sites ?? [];
  const site = sites.find((s) => s.id.toLowerCase() === tienda.toLowerCase() || s.code.toLowerCase() === tienda.toLowerCase());
  if (!site) fail(`La tienda «${tienda}» no existe o no es visible para este usuario.`);
  console.log(`Tienda: ${site.name} (${site.code})`);

  const employees = (await call("GET", "employees", token)).data.employees ?? [];
  const byDoc = new Map(employees.filter((e) => e.documentId).map((e) => [e.documentId, e]));
  const missing = people.filter((p) => !byDoc.has(p.cedula));
  if (missing.length) {
    console.error("\nEstas personas no están cargadas en Reloj (cárguelas antes con importar-empleados):");
    missing.forEach((p) => console.error(`  ✗ ${mask(p.cedula)} ${p.nombre}`));
    process.exit(1);
  }

  // Resumen local
  console.log("");
  const cells = [];
  for (const p of people) {
    let net = 0;
    let days = 0;
    for (const { index, cell } of p.cells) {
      if (!cell) continue;
      const date = addDays(week, index);
      if (cell.kind === "turno") {
        net += netMinutes(cell.startHm, cell.endHm, p.lunch);
        days += 1;
        cells.push({ employeeId: byDoc.get(p.cedula).id, date, kind: "turno", startHm: cell.startHm, endHm: cell.endHm, lunchMin: p.lunch });
      } else cells.push({ employeeId: byDoc.get(p.cedula).id, date, kind: "descanso" });
    }
    console.log(`  ${mask(p.cedula).padEnd(12)} ${p.nombre.padEnd(38)} ${String(days).padStart(1)} turnos · ${fmtH(net).padStart(5)} h netas`);
  }
  console.log(`\n${cells.length} celdas (${cells.filter((c) => c.kind === "turno").length} turnos, ${cells.filter((c) => c.kind === "descanso").length} descansos)`);
  if (!aplicar) {
    console.log("Para cargarlo como borrador, repita agregando --aplicar.");
    return;
  }

  // Cronograma: reutiliza el borrador/devuelto o abre uno nuevo
  let view = (await call("GET", "plans", token, null, { site: site.id, week })).data;
  const open = view.plan && ["borrador", "devuelto"].includes(view.plan.status);
  if (!open) {
    if (view.plan && !nuevaVersion) fail(`Ya hay un cronograma ${view.plan.status} (v${view.plan.version}). Use --nueva-version "motivo del cambio" para crear otra versión.`);
    const created = await call("POST", "plans", token, { siteId: site.id, weekStart: week, changeReason: nuevaVersion });
    if (created.status !== 201) fail(`No se pudo crear el cronograma (${created.status}): ${created.data.error ?? ""}`);
    view = created.data;
    console.log(`Cronograma creado: v${view.plan.version} en borrador`);
  } else console.log(`Se actualiza el cronograma v${view.plan.version} (${view.plan.status})`);

  const saved = await call("PUT", `plans/${view.plan.id}`, token, { cells });
  if (saved.status !== 200) fail(`Reloj rechazó los turnos (${saved.status}): ${saved.data.error ?? ""}`);
  view = saved.data;
  console.log(`✓ ${cells.length} celdas guardadas en el cronograma v${view.plan.version} (${view.plan.status})`);
  if (view.coverage.length) console.log(`  ⚠ ${view.coverage.length} franja(s) sin gerente ni coordinador (${view.opensHm}–${view.closesHm}): ${view.coverage.slice(0, 4).map((g) => `${g.date} ${g.fromHm}-${g.toHm}`).join("; ")}${view.coverage.length > 4 ? "…" : ""}`);
  view.warnings.slice(0, 10).forEach((w) => console.log(`  ⚠ ${w.message}`));

  if (enviar) {
    const sent = await call("POST", `plans/${view.plan.id}`, token, { action: "submit" });
    if (sent.status !== 200) fail(`No se pudo enviar (${sent.status}): ${sent.data.error ?? ""}`);
    console.log("✓ Enviado al gerente regional");
  } else console.log("El cronograma queda en BORRADOR: revíselo en el Planificador y envíelo cuando esté listo.");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
