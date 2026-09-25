const base = process.env.SMOKE_URL || "http://127.0.0.1:47321";
const key = process.env.DEMO_API_KEY || "demo-rfp-bio-2026";

async function req(method, path, body, authed = true) {
  const headers = { Accept: "application/json" };
  if (body) headers["Content-Type"] = "application/json";
  if (authed) headers["X-API-Key"] = key;
  const res = await fetch(`${base}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = text;
  }
  if (!res.ok) {
    throw new Error(`${method} ${path} → ${res.status} ${text.slice(0, 240)}`);
  }
  return data;
}

const health = await req("GET", "/api/v1/health", null, false);
if (!health.ok) throw new Error("health");

const login = await req("POST", "/api/v1/auth/login", {
  email: "admin@reloj.cr",
  password: process.env.ADMIN_PASSWORD || "RelojCR-Admin-2026!",
}, false);
if (!login.token) throw new Error("login");

const me = await req("GET", "/api/v1/auth/me");
if (me.user?.role !== "superadmin" && me.user?.email !== "api@reloj.cr") {
  /* API key actor also ok */
}

const created = await req("POST", "/api/v1/employees", {
  name: "Smoke RFP",
  code: `SMK-${Date.now().toString(36).toUpperCase()}`,
  siteId: "site_r01",
  role: "Prueba",
});
const empId = created.employee.id;

const punchId = `01SMOKE${Date.now().toString(16).toUpperCase().padStart(16, "0").slice(0, 16)}`;
const punch = await req("POST", "/api/v1/punches", {
  id: punchId,
  siteId: "site_r01",
  type: "IN",
  capturedAt: new Date().toISOString(),
  terminalId: "smoke-term",
  employeeId: empId,
  decision: "matched",
  livenessHint: "skipped",
});
if (!punch.created) throw new Error("punch create");

const again = await req("POST", "/api/v1/punches", {
  id: punchId,
  siteId: "site_r01",
  type: "IN",
  capturedAt: new Date().toISOString(),
  terminalId: "smoke-term",
  employeeId: empId,
  decision: "matched",
  livenessHint: "skipped",
});
if (again.created) throw new Error("punch should be idempotent");

const feed = await req("GET", `/api/v1/punches?site=site_r01&limit=50`);
if (!feed.punches.some((p) => p.id === punchId)) {
  throw new Error("punch not on dashboard feed");
}

const corr = await req("POST", "/api/v1/corrections", {
  punchId,
  reason: "Ajuste smoke RFP",
});
if (!corr.correction) throw new Error("correction");

const pin = await req("POST", "/api/v1/punches/pin", {
  employeeId: empId,
  siteId: "site_r01",
  type: "OUT",
  terminalId: "smoke-term",
  reason: "Falla facial simulada",
  supervisorPin: process.env.SUPERVISOR_PIN || "2468",
});
if (!pin.created) throw new Error("pin punch");

const pack = await req("GET", "/api/v1/exports/pack?format=json");
if (!pack.dump?.punches) throw new Error("export pack");

const report = await req("GET", "/api/v1/reports?site=site_r01");
if (!report.totals) throw new Error("report");

await req("PATCH", `/api/v1/employees/${empId}`, { deleted: true });

console.log("rfp-smoke.mjs ok", {
  edition: health.edition,
  punchId,
  employee: empId,
});
