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

// Sin sesión, las rutas con datos personales rechazan.
for (const route of [`/api/employees/${target.id}/templates`, "/api/employees", "/api/punches", "/api/terminals", "/api/audit"]) {
  check(`sin sesión: ${route} → 401`, (await call(null, "GET", route)).status === 401);
}

console.log(`${checks - fails.length}/${checks} comprobaciones correctas`);
if (fails.length) {
  console.log("FALLAS:\n- " + fails.join("\n- "));
  process.exit(1);
}
