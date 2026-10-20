// Carga datos dummy (~100 colaboradores) para ver la herramienta funcional.
// Idempotente: limpia y regenera con PRNG fijo (mismas marcas en cada corrida).
// Uso: node scripts/seed-dummy.mjs   ·   npm run seed:dummy
import Database from "better-sqlite3";
import path from "node:path";

const dataDir = process.env.DATA_DIR || path.join(process.cwd(), "data");
const DB_FILE = path.join(dataDir, process.env.SANDBOX === "true" ? "asistencia.sandbox.db" : "asistencia.db");
const TZ = "America/Bogota";
const OFFSET = "-05:00"; // Colombia sin DST

function mulberry32(seed) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rnd = mulberry32(20261009);
const ri = (a, b) => a + Math.floor(rnd() * (b - a + 1));

const FIRST = ["Andrés","Camila","Johan","Valentina","Sebastián","Laura","Mateo","Daniela","Nicolas","Isabella","Juan","Paula","Diego","Camilo","Andrea","Felipe","Daniela","Óscar","Sara","Miguel","Juliana","Esteban","María","Jorge","Claudia","Ricardo","Lucía","Héctor","Diana","Samuel","Pilar","Rafael","Tatiana","Iván","Mónica","Camilo","Laura","Julián","Adriana","Óscar"];
const LAST = ["García","Rodríguez","Martínez","López","Hernández","Gómez","Pérez","Sánchez","Ramírez","Torres","Flores","Vargas","Cruz","Ríos","Morales","Ortega","Delgado","Castro","Jiménez","Ruiz","Mendoza","Alvarez","Castillo","Vega","Campos","Fuentes","Cabrera","Bermúdez","Quintero","Palacios"];
const ROLES = ["Mesero","Mesera","Cocinero","Cocinera","Cajero","Cajera","Barista","Ayudante de cocina","Auxiliar de salón","Delivery"];
const SITES = ["site_r01", "site_r02", "site_r03", "site_r04", "site_r05"];
const EXISTING = ["emp_ana", "emp_carlos", "emp_maria", "emp_luis", "emp_sofia"];

// kind: aman | std | tarde | noche | over (overworked = horas extra para alertas)
function kindOf(i) {
  return i >= 94 ? "over" : ["aman", "std", "tarde", "noche"][i % 4];
}
const CFG = {
  aman: { start: "06:00", end: "14:00", shift: "shift_aman", brk: ["09:45", "10:45"] },
  std: { start: "07:00", end: "16:00", shift: "shift_std", brk: ["12:00", "13:00"] },
  tarde: { start: "14:00", end: "22:00", shift: "shift_tarde", brk: ["18:00", "19:00"] },
  noche: { start: "22:00", end: "06:00", shift: "shift_noche", brk: ["02:00", "03:00"] },
  over: { start: "08:00", end: "20:00", shift: null, brk: ["13:00", "14:00"] },
};

function hmMin(hm) {
  const [h, m] = hm.split(":").map(Number);
  return h * 60 + m;
}
const minHm = (min) => `${String(Math.floor((min + 1440) % 1440 / 60)).padStart(2, "0")}:${String((min + 1440) % 60).padStart(2, "0")}`;

// Hora local actual (Bogota) para no generar marcas futuras hoy.
function localNow() {
  const fmt = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false });
  const p = Object.fromEntries(fmt.formatToParts(new Date()).map((x) => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, min: Number(p.hour) * 60 + Number(p.minute) };
}

const db = new Database(DB_FILE);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

// ---------- protección: este script BORRA marcaciones y empleados de demostración ----------
// Solo debe correr sobre una base de demo. Se niega si el entorno es de producción o si
// la base tiene marcaciones que no vienen de este script (por ejemplo, un piloto real).
const force = process.env.DEMO_SEED_FORCE === "1";
if (process.env.NODE_ENV === "production" && !force) {
  console.error("seed-dummy: NODE_ENV=production. Este script borra datos; no se ejecuta en producción.");
  process.exit(1);
}
const now = localNow();
const today = now.date;
// Historia hacia atrás desde hoy. Por defecto, desde el día 1 del mes anterior (dos meses completos
// de referencia para los reportes); SEED_DAYS=N fija una cantidad de días calendario (1–180).
const addDays = (date, n) => new Date(new Date(`${date}T12:00:00Z`).getTime() + n * 86400000).toISOString().slice(0, 10);
const prevMonthStart = (() => {
  const [y, m] = today.split("-").map(Number);
  return new Date(Date.UTC(m === 1 ? y - 1 : y, m === 1 ? 11 : m - 2, 1, 12)).toISOString().slice(0, 10);
})();
const DAYS = process.env.SEED_DAYS
  ? Math.max(1, Math.min(180, Number(process.env.SEED_DAYS) || 45))
  : Math.round((Date.parse(`${today}T12:00:00Z`) - Date.parse(`${prevMonthStart}T12:00:00Z`)) / 86400000) + 1;
const startDate = addDays(today, -(DAYS - 1));

const foreign = db
  .prepare("SELECT count(*) n FROM punches WHERE id NOT LIKE 'pd%' AND captured_at >= ? AND employee_id IN (" + EXISTING.map(() => "?").join(",") + ")")
  .get(startDate, ...EXISTING).n;
// Con marcaciones reales de los empleados originales no se tocan: solo se generan los 100 ficticios.
const touchExisting = foreign === 0 || force;
if (!touchExisting) {
  console.log(`seed-dummy: ${foreign} marcaciones reales del periodo se conservan; solo se cargan los empleados ficticios.`);
}

// ---------- limpieza idempotente ----------
db.prepare("DELETE FROM exceptions WHERE employee_id LIKE 'emp_d%'").run();
db.prepare("DELETE FROM punches WHERE employee_id LIKE 'emp_d%'").run();
if (touchExisting) {
  db.prepare(`DELETE FROM punches WHERE employee_id IN (${EXISTING.map(() => "?").join(",")}) AND captured_at >= ?`).run(...EXISTING, startDate);
}
db.prepare("DELETE FROM schedules WHERE employee_id LIKE 'emp_d%'").run();
db.prepare("DELETE FROM contracts WHERE employee_id LIKE 'emp_d%'").run();
db.prepare("DELETE FROM employees WHERE id LIKE 'emp_d%'").run();
db.prepare("DELETE FROM sites WHERE id IN ('site_r03','site_r04','site_r05')").run();

// ---------- sitios extra (5 sedes para KPIs por sede y filtro regional) ----------
const insSite = db.prepare("INSERT INTO sites (id, code, name, city, timezone, country_id, zone_id) VALUES (?,?,?,?,?,?,?)");
insSite.run("site_r03", "R03", "Café Central Chapinero", "Bogotá", TZ, "cty_co", "zone_andina");
insSite.run("site_r04", "R04", "Panadería El Trigal", "Medellín", TZ, "cty_co", "zone_andina");
insSite.run("site_r05", "R05", "Heladería Bocagrande", "Cartagena", TZ, "cty_co", "zone_caribe");

const employees = [];
for (let i = 1; i <= 100; i++) {
  const id = `emp_d${String(i).padStart(3, "0")}`;
  const code = `D${String(i).padStart(3, "0")}`;
  const name = `${FIRST[i % FIRST.length]} ${LAST[(i * 7) % LAST.length]}`;
  const site = SITES[i % SITES.length];
  employees.push({ i, id, code, name, site, kind: kindOf(i), role: ROLES[i % ROLES.length] });
}
const targets = [...employees.map((e) => e.id), ...EXISTING];

const tx = db.transaction(() => {
  const insEmp = db.prepare("INSERT INTO employees (id, code, name, site_id, role, active, created_at) VALUES (?,?,?,?,?,1,?)");
  const insSched = db.prepare("INSERT INTO schedules (id, employee_id, weekday, start_hm, end_hm, late_grace_min, shift_id) VALUES (?,?,?,?,?,10,?)");
  const insContract = db.prepare("INSERT INTO contracts (id, employee_id, monthly_salary, weekly_hours, currency) VALUES (?,?,?,?, 'COP')");
  const insPunch = db.prepare(
    "INSERT INTO punches (id, employee_id, site_id, type, captured_at, received_at, terminal_id, match_score, decision, offline, liveness_hint, method, event_type) VALUES (?,?,?,?,?,?,?,?,?,0,?,?,?)",
  );
  const insExc = db.prepare("INSERT INTO exceptions (id, employee_id, date, type, reason, created_at) VALUES (?,?,?,?,?,?)");

  const contracts = new Set((db.prepare("SELECT employee_id FROM contracts").all()).map((r) => r.employee_id));
  const upContract = db.prepare("UPDATE contracts SET monthly_salary = ?, weekly_hours = ? WHERE employee_id = ?");

  for (const e of employees) {
    insEmp.run(e.id, e.code, e.name, e.site, e.role, `${addDays(startDate, -1)}T08:00:00.000Z`);
    const cfg = CFG[e.kind];
    for (let wd = 1; wd <= 5; wd++) insSched.run(`sch_${e.id}_${wd}`, e.id, wd, cfg.start, cfg.end, cfg.shift);

    const salary = e.kind === "over" ? 2600000 : e.kind === "noche" ? 2200000 : { aman: 1500000, std: 1700000, tarde: 1600000 }[e.kind] + (e.i % 3) * 100000;
    const weekly = e.kind === "over" ? 48 : 44;
    if (contracts.has(e.id)) upContract.run(salary, weekly, e.id);
    else insContract.run(`con_${e.id}`, e.id, salary, weekly);
  }

  // Contratos para los 5 originales que no tengan (deja el de emp_ana como está).
  for (const id of EXISTING) {
    if (contracts.has(id)) continue;
    insContract.run(`con_${id}`, id, 1800000, 44);
  }

  let pid = 0;
  const punch = (emp, type, date, hm) => {
    const captured = `${date}T${hm}:00${OFFSET}`;
    const [h, m] = hm.split(":").map(Number);
    const recv = `${date}T${String((h + (m + 2 >= 60 ? 1 : 0)) % 24).padStart(2, "0")}:${String((m + 2) % 60).padStart(2, "0")}:00${OFFSET}`;
    const ev = type === "IN" || type === "BREAK_END" ? "IN" : "OUT";
    insPunch.run(`pd${String(++pid).padStart(7, "0")}`, emp.id, emp.site, type, captured, recv, "term_seed", 0.97, "matched", "passed", "face", ev);
  };

  // Días laborables (lunes a viernes) desde hoy hacia atrás.
  const workdays = [];
  for (let i = DAYS - 1; i >= 0; i--) {
    const date = addDays(today, -i);
    const dow = new Date(`${date}T12:00:00Z`).getUTCDay();
    if (dow !== 0 && dow !== 6) workdays.push(date);
  }
  for (const date of workdays) {
    const isToday = date === today;

    for (const e of [...employees, ...(touchExisting ? EXISTING : []).map((id) => ({ id, kind: "std", site: null }))]) {
      const cfg = CFG[e.kind] ?? CFG.std;
      const emp = employees.find((x) => x.id === e.id) ?? {
        id: e.id,
        site: db.prepare("SELECT site_id FROM employees WHERE id = ?").get(e.id).site_id,
        kind: e.kind,
      };

      if (rnd() < 0.1) continue; // ~10% ausente

      const late = rnd() < 0.14;
      const early = !late && rnd() < 0.06;
      const startM = hmMin(cfg.start);
      const inHm = late ? minHm(startM + ri(11, 35)) : minHm(startM + ri(-7, 7));

      if (isToday) {
        // Hoy solo entrada (si el turno ya empezó): nunca marcas futuras.
        if (hmMin(inHm) <= now.min) punch(emp, "IN", date, inHm);
        continue;
      }

      punch(emp, "IN", date, inHm);
      punch(emp, "BREAK_START", date, cfg.brk[0]);
      punch(emp, "BREAK_END", date, cfg.brk[1]);
      if (early) {
        punch(emp, "OUT", date, minHm(hmMin(cfg.end) - ri(35, 50)));
      } else if (e.kind === "noche") {
        // Sale a la mañana siguiente con 0–40 min de extra nocturno.
        const next = new Date(new Date(`${date}T12:00:00Z`).getTime() + 86400000).toISOString().slice(0, 10);
        punch(emp, "OUT", next, minHm(hmMin(cfg.end) + ri(0, 40)));
      } else {
        punch(emp, "OUT", date, minHm(hmMin(cfg.end) + ri(-5, 15)));
      }
    }
  }

  // Unas licencias justificadas para variedad (excluidas de alerta de faltas injustificadas).
  const past = workdays.filter((d) => d < today);
  const pick = (k) => past[Math.min(past.length - 1, Math.floor((past.length * k) / 10))];
  const exc = [
    ["emp_d010", pick(2)], ["emp_d011", pick(3)], ["emp_d012", pick(4)], ["emp_d012", pick(5)], ["emp_d012", pick(6)],
    ["emp_d030", pick(5)], ["emp_d031", pick(7)], ["emp_d031", pick(8)],
  ].filter(([, d]) => d);
  for (const [id, d] of exc) insExc.run(`exc_${id}_${d}`, id, d, "justified", "Licencia médica justificada", `${startDate}T08:00:00.000Z`);
});

tx();

const counts = {};
for (const t of ["employees", "schedules", "contracts", "punches", "exceptions", "sites"]) {
  counts[t] = db.prepare(`SELECT count(*) n FROM ${t}`).get().n;
}
console.log(`seed-dummy ok: ${DAYS} días hacia atrás desde ${today} (desde ${startDate})`, counts);
db.close();
