// Prueba de permisos y alcance por rol contra un servidor en marcha con datos en 2 sedes
// (por ejemplo, tras scripts/demo-seed.mjs). No modifica datos de forma permanente:
// las escrituras que se intentan deben ser rechazadas, salvo enrolar un empleado de la propia sede.
// Uso: BASE=http://localhost:3200 ADMIN_PASSWORD=... node scripts/roles-smoke.mjs
const BASE = process.env.BASE || "http://localhost:3200";
const PASSWORD = process.env.ADMIN_PASSWORD;
if (!PASSWORD) throw new Error("Falta ADMIN_PASSWORD");

const fails = [];
let checks = 0;
const check = (name, ok, extra = "") => {
  checks += 1;
  if (!ok) fails.push(`${name} ${extra}`.trim());
};

async function call(token, method, route, body) {
  const res = await fetch(BASE + route, {
    method,
    headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
}

const roles = ["admin", "zona", "sede", "operador", "auditor"];
const token = {};
for (const r of roles) {
  const { data } = await call(null, "POST", "/api/v1/auth/login", { email: `${r}@reloj.cr`, password: PASSWORD });
  token[r] = data.token;
  if (!token[r]) throw new Error(`No pude entrar como ${r}`);
}

const allSites = (await call(token.admin, "GET", "/api/v1/sites")).data.sites.map((s) => s.id);
const allEmployees = (await call(token.admin, "GET", "/api/v1/employees")).data.employees;
check("hay datos en al menos 2 sedes", allSites.length >= 2 && new Set(allEmployees.map((e) => e.siteId)).size >= 2);

const descriptors = () => [Array.from({ length: 128 }, () => Math.random())];

for (const r of ["zona", "sede", "operador"]) {
  const mine = (await call(token[r], "GET", "/api/v1/sites")).data.sites.map((s) => s.id);
  check(`${r}: ve menos sedes que el administrador`, mine.length >= 1 && mine.length < allSites.length);
  const within = (rows, field = "siteId") => rows.every((x) => mine.includes(x[field]));

  check(`${r}: /api/employees solo de su alcance`, within((await call(token[r], "GET", "/api/employees")).data.employees));
  check(`${r}: /api/v1/employees solo de su alcance`, within((await call(token[r], "GET", "/api/v1/employees")).data.employees));
  const punches = (await call(token[r], "GET", "/api/punches?limit=500")).data.punches;
  check(`${r}: /api/punches solo de su alcance`, punches.length > 0 && within(punches));
  check(`${r}: /api/terminals solo de su alcance`, within((await call(token[r], "GET", "/api/terminals")).data.terminals));

  const outside = allEmployees.find((e) => !mine.includes(e.siteId));
  const inside = allEmployees.find((e) => mine.includes(e.siteId));
  check(`${r}: empleado de otra sede no existe para él (404)`, (await call(token[r], "GET", `/api/v1/employees/${outside.id}`)).status === 404);
  check(`${r}: no puede capturar biometría fuera de su sede`, (await call(token[r], "POST", `/api/employees/${outside.id}/templates`, { descriptors: descriptors() })).status === 404);
  check(`${r}: no puede borrar biometría fuera de su sede`, (await call(token[r], "DELETE", `/api/employees/${outside.id}/templates`)).status === 404);
  check(`${r}: no puede editar a un empleado de otra sede`, (await call(token[r], "PATCH", `/api/v1/employees/${outside.id}`, { role: "x" })).status === 404);
  check(`${r}: no puede crear empleados en otra sede`, (await call(token[r], "POST", "/api/v1/employees", { name: "X", code: `Z-${r}`, siteId: outside.siteId })).status === 403);
  check(`${r}: sí puede capturar biometría en su sede`, (await call(token[r], "POST", `/api/employees/${inside.id}/templates`, { descriptors: descriptors() })).status === 201);
  check(`${r}: no cambia ajustes globales`, (await call(token[r], "PATCH", "/api/v1/settings", { retention_days: "365" })).status === 403);
  check(`${r}: no aplica la retención`, (await call(token[r], "POST", "/api/v1/settings/retention")).status === 403);
}

check("operador: sin auditoría (403)", (await call(token.operador, "GET", "/api/audit")).status === 403);
check("operador: sin exportación (403)", (await call(token.operador, "GET", "/api/v1/exports/pack?format=csv")).status === 403);
check("operador: no escanea anomalías (403)", (await call(token.operador, "POST", "/api/v1/anomalies")).status === 403);
check("operador: no corrige marcas (403)", (await call(token.operador, "POST", "/api/v1/corrections", { punchId: "x", reason: "y" })).status === 403);

for (const r of ["zona", "sede"]) {
  const mine = (await call(token[r], "GET", "/api/v1/sites")).data.sites.map((s) => s.id);
  const ev = (await call(token[r], "GET", "/api/audit")).data.events;
  check(`${r}: auditoría solo con eventos de su alcance`, ev.every((e) => mine.includes(e.payload?.siteId)));
  const csv = await fetch(`${BASE}/api/v1/exports/pack?format=json`, { headers: { authorization: `Bearer ${token[r]}` } });
  const dump = await csv.json().catch(() => ({}));
  const rows = dump.punches ?? dump.pack?.punches ?? [];
  check(`${r}: exportación solo de su alcance`, csv.status === 200 && rows.every((p) => mine.includes(p.siteId ?? p.sede)));
}

// Escanear anomalías dos veces el mismo día no debe fallar (antes devolvía 500 al repetir).
check("superadmin: escaneo de anomalías", (await call(token.admin, "POST", "/api/v1/anomalies")).status === 200);
check("superadmin: repetir el escaneo", (await call(token.admin, "POST", "/api/v1/anomalies")).status === 200);
check("gerente de sede: escanea anomalías", (await call(token.sede, "POST", "/api/v1/anomalies")).status === 200);

// El auditor lee todo y no modifica nada.
const target = allEmployees[0];
check("auditor: ve todas las sedes", (await call(token.auditor, "GET", "/api/v1/sites")).data.sites.length === allSites.length);
check("auditor: no captura biometría", (await call(token.auditor, "POST", `/api/employees/${target.id}/templates`, { descriptors: descriptors() })).status === 403);
check("auditor: no borra biometría", (await call(token.auditor, "DELETE", `/api/employees/${target.id}/templates`)).status === 403);
check("auditor: no crea empleados", (await call(token.auditor, "POST", "/api/v1/employees", { name: "X", code: "Z-aud", siteId: target.siteId })).status === 403);
check("auditor: no edita empleados", (await call(token.auditor, "PATCH", `/api/v1/employees/${target.id}`, { role: "x" })).status === 403);
check("auditor: no cambia ajustes", (await call(token.auditor, "PATCH", "/api/v1/settings", { retention_days: "365" })).status === 403);
check("auditor: no escanea anomalías", (await call(token.auditor, "POST", "/api/v1/anomalies")).status === 403);
check("auditor: sí lee la auditoría", (await call(token.auditor, "GET", "/api/audit")).status === 200);

// Sueldos, turnos, informe mensual y estructura (módulos de nómina y administración).
{
  const get = async (r, route) => call(token[r], "GET", route);
  const outside = allEmployees.find((e) => e.siteId !== (allEmployees.find((x) => x.siteId === "site_r01")?.siteId ?? ""));
  const mineR01 = allEmployees.find((e) => e.siteId === "site_r01");

  check("operador: no ve sueldos (403)", (await get("operador", "/api/v1/contracts")).status === 403);
  check("gerente de sede: ve sueldos", (await get("sede", "/api/v1/contracts")).status === 200);
  check("auditor: ve sueldos", (await get("auditor", "/api/v1/contracts")).status === 200);
  check("operador: no fija sueldos (403)", (await call(token.operador, "POST", "/api/v1/contracts", { employeeId: mineR01.id, monthlySalary: 1_500_000 })).status === 403);
  check("auditor: no fija sueldos (403)", (await call(token.auditor, "POST", "/api/v1/contracts", { employeeId: mineR01.id, monthlySalary: 1_500_000 })).status === 403);
  check("gerente de sede: no fija sueldo de otra sede", (await call(token.sede, "POST", "/api/v1/contracts", { employeeId: outside.id, monthlySalary: 1_500_000 })).status === 404);
  check("gerente de sede: fija sueldo en su sede", (await call(token.sede, "POST", "/api/v1/contracts", { employeeId: mineR01.id, monthlySalary: 1_800_000, weeklyHours: 42 })).status === 201);
  check("sueldo inválido se rechaza (400)", (await call(token.admin, "POST", "/api/v1/contracts", { employeeId: mineR01.id, monthlySalary: -5 })).status === 400);
  const seeSede = (await get("sede", "/api/v1/contracts")).data.contracts;
  check("gerente de sede: solo sueldos de su alcance", seeSede.every((c) => c.site_id === "site_r01") && seeSede.length >= 1);

  const month = new Date().toISOString().slice(0, 7);
  const payOp = (await get("operador", `/api/v1/reports/dashboard?month=${month}`)).data.payroll;
  const paySede = (await get("sede", `/api/v1/reports/dashboard?month=${month}`)).data.payroll;
  check("operador: el tablero muestra horas pero no dinero", payOp.length > 0 && payOp.every((p) => p.totalValue === null && p.hourlyRate === null));
  check("gerente de sede: el tablero muestra valores", paySede.some((p) => typeof p.totalValue === "number"));
  check("tablero: solo personas de su alcance", paySede.every((p) => p.siteId === "site_r01"));

  check("turnos: el gerente de sede no los cambia", (await call(token.sede, "POST", "/api/v1/shifts", { name: "X", startHm: "08:00", endHm: "16:00" })).status === 403);
  check("turnos: el superadmin sí", (await call(token.admin, "POST", "/api/v1/shifts", { name: "Prueba", startHm: "08:00", endHm: "16:00" })).status === 201);
  check("turno asignado a su empleado", (await call(token.sede, "POST", "/api/v1/schedules", { employeeId: mineR01.id, weekday: 1, shiftId: "shift_std" })).status === 201);
  check("turno asignado a empleado de otra sede (404)", (await call(token.sede, "POST", "/api/v1/schedules", { employeeId: outside.id, weekday: 1, shiftId: "shift_std" })).status === 404);

  check("informe mensual: el gerente de sede no lo envía", (await call(token.sede, "POST", "/api/v1/reports/monthly-send", {})).status === 403);
  check("informe mensual: el operador no lo envía", (await call(token.operador, "POST", "/api/v1/reports/monthly-send", {})).status === 403);
  check("informe mensual: sin dirección no sale nada", [200, 502].includes((await call(token.admin, "POST", "/api/v1/reports/monthly-send", {})).status));

  check("ajuste fuera de rango se rechaza", (await call(token.admin, "PATCH", "/api/v1/settings", { ot_day_multiplier: "99" })).status === 400);
  check("informe mensual a red interna se rechaza", (await call(token.admin, "PATCH", "/api/v1/settings", { monthly_report_endpoint: "https://10.0.0.5/x" })).status === 400);
  check("informe mensual sin https se rechaza", (await call(token.admin, "PATCH", "/api/v1/settings", { monthly_report_endpoint: "http://example.com/x" })).status === 400);
  check("festivos inválidos se rechazan", (await call(token.admin, "PATCH", "/api/v1/settings", { holidays: "no" })).status === 400);
  check("ajustes: el gerente no ve la dirección del informe", !("monthly_report_endpoint" in (await get("sede", "/api/v1/settings")).data.settings));

  // Sufijo único: la prueba se puede repetir sobre la misma base.
  const uniq = Date.now().toString(36).slice(-5).toUpperCase();
  const zoneName = `Región Prueba ${uniq}`;
  check("región nueva: la crea el superadmin", (await call(token.admin, "POST", "/api/v1/zones", { name: zoneName, countryId: "cty_co" })).status === 201);
  check("región repetida se rechaza", (await call(token.admin, "POST", "/api/v1/zones", { name: zoneName, countryId: "cty_co" })).status === 400);
  check("región nueva: el gerente de zona no puede", (await call(token.zona, "POST", "/api/v1/zones", { name: "Otra", countryId: "cty_co" })).status === 403);
  const newSite = await call(token.admin, "POST", "/api/v1/sites", { code: `PRB-${uniq}`, name: "Sede de prueba", city: "Barranquilla", zoneId: "zone_andina" });
  check("sede nueva: la crea el superadmin", newSite.status === 201 && newSite.data.site.code === `PRB-${uniq}`);
  check("sede repetida se rechaza", (await call(token.admin, "POST", "/api/v1/sites", { code: `prb-${uniq}`.toLowerCase(), name: "Otra", city: "X", zoneId: "zone_andina" })).status === 400);
  check("sede nueva: el gerente de sede no puede", (await call(token.sede, "POST", "/api/v1/sites", { code: `PRX-${uniq}`, name: "X", city: "X", zoneId: "zone_andina" })).status === 403);
  check("sede: el superadmin la edita", (await call(token.admin, "PATCH", `/api/v1/sites/${newSite.data.site.id}`, { name: "Sede renombrada" })).status === 200);
  check("sede: el gerente de zona no la edita", (await call(token.zona, "PATCH", `/api/v1/sites/${newSite.data.site.id}`, { name: "No" })).status === 403);
  check("la sede nueva aparece para el superadmin", (await get("admin", "/api/v1/sites")).data.sites.some((x) => x.code === `PRB-${uniq}`));

  const siteOutside = allSites.find((id) => id !== "site_r01");
  check("briefing: el operador no pide otra sede", (await call(token.operador, "POST", `/api/v1/ai/briefing?site=${siteOutside}`)).status === 403);
  const chat = await call(token.operador, "POST", "/api/v1/ai/chat", { question: "terminales", zoneId: "zone_caribe" });
  check("chat: la región elegida no amplía el alcance", chat.status === 200 && !JSON.stringify(chat.data).includes(siteOutside));
}

// Sin sesión, las rutas con datos personales rechazan.
for (const route of [`/api/employees/${target.id}/templates`, "/api/employees", "/api/punches", "/api/terminals", "/api/audit"]) {
  check(`sin sesión: ${route} → 401`, (await call(null, "GET", route)).status === 401);
}

console.log(`${checks - fails.length}/${checks} comprobaciones correctas`);
if (fails.length) {
  console.log("FALLAS:\n- " + fails.join("\n- "));
  process.exit(1);
}
