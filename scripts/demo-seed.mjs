// Carga datos de DEMOSTRACIÓN en una instancia local de Reloj CR: marca del cliente
// (con logo opcional), horarios, una semana de marcaciones, una corrección y alertas.
// Uso: BASE=http://localhost:3200 ADMIN_PASSWORD=... [LOGO_FILE=/ruta/logo.svg] [BRAND=none] node scripts/demo-seed.mjs
// Solo para demos: los empleados son los ficticios del sistema; no cargue datos reales.
import { readFileSync } from "node:fs";
import path from "node:path";

const BASE = process.env.BASE || "http://localhost:3200";
const PASSWORD = process.env.ADMIN_PASSWORD;
if (!PASSWORD) throw new Error("Falta ADMIN_PASSWORD");

async function call(method, route, body, token) {
  const res = await fetch(BASE + route, {
    method,
    headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${method} ${route} -> ${res.status} ${JSON.stringify(data)}`);
  return data;
}

const { token } = await call("POST", "/api/v1/auth/login", { email: "admin@reloj.cr", password: PASSWORD });

// Marca: colores del brand book de Burger King Colombia y, si se indica, el logo del cliente.
const brand = {
  brand_name: "Burger King Colombia",
  brand_primary: "#D62300",
  brand_dark: "#502314",
  brand_light: "#F5EBDC",
};
if (process.env.LOGO_FILE) {
  const types = { ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp" };
  const mime = types[path.extname(process.env.LOGO_FILE).toLowerCase()];
  if (!mime) throw new Error("LOGO_FILE debe ser svg, png, jpg o webp");
  brand.brand_logo = `data:${mime};base64,${readFileSync(process.env.LOGO_FILE).toString("base64")}`;
}
// BRAND=none deja la versión básica (para mostrar la demo a una empresa que no es ese cliente).
if (process.env.BRAND !== "none") await call("PATCH", "/api/v1/settings", brand, token);

const { employees } = await call("GET", "/api/v1/employees", null, token);
const BOGOTA = "-05:00";
const day = (offset) => {
  const d = new Date(Date.now() + offset * 86_400_000);
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota" }).format(d);
};
const at = (date, hm) => new Date(`${date}T${hm}:00${BOGOTA}`).toISOString();
const weekday = (date) => new Date(`${date}T12:00:00${BOGOTA}`).getDay();

// Horarios de lunes a viernes, 07:00 a 15:00, con 10 minutos de tolerancia.
for (const e of employees) {
  for (let wd = 1; wd <= 5; wd += 1) {
    await call("POST", "/api/v1/schedules", { employeeId: e.id, weekday: wd, startHm: "07:00", endHm: "15:00", lateGraceMin: 10 }, token);
  }
}

// Una semana de marcaciones: la mayoría trabaja de lunes a viernes, 8 h. Solo dos casos activan
// alertas: el primer empleado llega tarde seguido y hace un día de 12 h, y el segundo trabaja
// siete días seguidos con turnos de 9 h.
let n = 0;
const punch = (e, type, iso, extra = {}) =>
  call("POST", "/api/punches", {
    id: `DEMO-${String(++n).padStart(4, "0")}`,
    siteId: e.siteId,
    employeeId: e.id,
    type,
    capturedAt: iso,
    terminalId: "demo-terminal",
    decision: "matched",
    matchScore: 0.28 + (n % 7) / 100,
    livenessHint: "pass",
    ...extra,
  }, token);

const todayStr = day(0);
const created = [];
for (let back = 6; back >= 0; back -= 1) {
  const date = day(-back);
  for (const [i, e] of employees.entries()) {
    const isToday = date === todayStr;
    const wd = weekday(date);
    if (i >= 2 && (wd === 0 || wd === 6)) continue; // fin de semana libre para el resto
    if (i === 0 && wd === 0) continue;
    const late = i === 0 && back % 2 === 1;
    const inHm = late ? "07:22" : `06:5${i}`;
    const outHm = i === 0 && back === 3 ? "19:05" : i <= 1 ? `16:0${i}` : `15:0${i}`;
    if (isToday) {
      // Hoy: entradas ya hechas; el último empleado todavía no llega.
      if (i === employees.length - 1) continue;
      created.push((await punch(e, "IN", at(date, inHm))).punch);
    } else {
      created.push((await punch(e, "IN", at(date, inHm))).punch);
      created.push((await punch(e, "OUT", at(date, outHm))).punch);
    }
  }
}

// Una corrección aprobada, con motivo.
const target = created.find((p) => p.type === "OUT");
if (target) {
  await call("POST", "/api/v1/corrections", { punchId: target.id, reason: "El empleado olvidó marcar la salida; confirmado por el supervisor", newTs: new Date(new Date(target.capturedAt).getTime() + 15 * 60_000).toISOString() }, token);
}

// Escanea alertas de los últimos días para que el tablero tenga contenido.
for (let back = 0; back <= 3; back += 1) await call("POST", `/api/v1/anomalies?day=${day(-back)}`, null, token);

console.log(`Demo lista: ${created.length} marcaciones, ${employees.length} empleados, ${process.env.BRAND === "none" ? "versión básica" : `marca "${brand.brand_name}"${brand.brand_logo ? " con logo" : ""}`}.`);
