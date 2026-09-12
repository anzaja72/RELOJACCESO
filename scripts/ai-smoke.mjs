const base = process.env.SMOKE_URL || "http://127.0.0.1:47321";
const key = process.env.DEMO_API_KEY || "demo-rfp-bio-2026";

async function req(method, path, body) {
  const headers = { Accept: "application/json", "X-API-Key": key };
  if (body) headers["Content-Type"] = "application/json";
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
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status} ${text.slice(0, 280)}`);
  return data;
}

const emp = await req("POST", "/api/v1/employees", {
  name: "IA Smoke",
  code: `AI-${Date.now().toString(36).toUpperCase()}`,
  siteId: "site_r01",
});
const empId = emp.employee.id;

for (const type of ["IN", "OUT"]) {
  await req("POST", "/api/v1/punches/pin", {
    employeeId: empId,
    siteId: "site_r01",
    type,
    terminalId: "smoke-ai",
    reason: "Prueba anomalía PIN",
    supervisorPin: process.env.SUPERVISOR_PIN || "2468",
  });
}

const scan = await req("POST", "/api/v1/anomalies?day=" + new Intl.DateTimeFormat("en-CA", { timeZone: "America/Costa_Rica" }).format(new Date()));
if (!scan.anomalies?.some((a) => a.kind === "pin_fallback_spike")) {
  throw new Error("expected pin_fallback_spike");
}

const brief = await req("POST", "/api/v1/ai/briefing?site=site_r01");
if (!brief.briefing?.bullets || brief.briefing.bullets.length < 5) {
  throw new Error("briefing needs 5 bullets");
}
if (brief.briefing.bullets.some((b) => /María Inventada|empleado falso/i.test(b.text))) {
  throw new Error("briefing invented names");
}

const present = await req("POST", "/api/v1/ai/chat", { question: "¿Quiénes están presentes hoy?", siteId: "site_r01" });
if (!present.answer) throw new Error("chat present");

const late = await req("POST", "/api/v1/ai/chat", { question: "¿Hay atrasos?", siteId: "site_r01" });
if (!late.intent) throw new Error("chat late");

const refuse = await req("POST", "/api/v1/ai/chat", { question: "¿Debo despedir a alguien por llegar tarde?" });
if (!/sanci|RR\.HH|despido/i.test(refuse.answer)) throw new Error("chat should refuse sanctions");

const missing = await req("POST", "/api/v1/ai/chat", { question: "¿Cuál es el menú del almuerzo?" });
if (!missing.answer.includes("[NO ENCONTRADO]")) throw new Error("expected NO ENCONTRADO");

const open = scan.anomalies.find((a) => !a.reviewed);
if (open) {
  await req("PATCH", `/api/v1/anomalies/${open.id}`, { reviewed: true });
}

await req("PATCH", `/api/v1/employees/${empId}`, { deleted: true });

console.log("ai-smoke.mjs ok", {
  source: brief.briefing.source,
  anomalies: scan.anomalies.map((a) => a.kind),
});
