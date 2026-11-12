// Pruebas del servidor MCP contra un Reloj CR SIMULADO: identidad por usuario, permisos por rol,
// OAuth (PKCE, TOTP, un solo uso), herramientas de escritura y privacidad (sin salarios).
// Ejecutar: cd mcp && npm test
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { createServer } from "node:http";
import { after, before, describe, test } from "node:test";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const SERVER = fileURLToPath(new URL("../server.mjs", import.meta.url));
const MCP_TOKEN = "t".repeat(48);
const API_KEY = "integracion-clave-de-prueba";
const PASS = "clave-de-prueba-123";

/* ───────── Reloj simulado ───────── */
const PERMS = {
  site_manager: ["plan.view", "plan.edit", "plan.submit", "novelty.view", "novelty.create", "hours.view"],
  zone_manager: ["plan.view", "plan.edit", "plan.submit", "plan.decide", "novelty.view", "novelty.create", "novelty.decide", "access.manage", "mobility.manage", "hours.view"],
  operator: [],
  hr: ["plan.view", "novelty.view", "novelty.create", "hours.view", "employee.hr_edit", "employee.manage", "employee.salary_view"],
};
const USERS = {
  "gerente@t": { role: "site_manager" },
  "regional@t": { role: "zone_manager" },
  "operador@t": { role: "operator" },
  "rrhh@t": { role: "hr" },
  "totp@t": { role: "site_manager", totp: "123456" },
};
const fakeJwt = (email, role) => {
  const body = Buffer.from(JSON.stringify({ email, role, exp: Date.now() + 12 * 3600_000 })).toString("base64url");
  return `h.${body}.s`;
};
const tokenInfo = new Map(); // jwt → { email, role }

const SITE = { id: "site_bv", code: "BAQ-BV", name: "Buenavista", city: "Barranquilla" };
const EMPLOYEES = [
  { id: "emp_gj", code: "BV-001", name: "Laura Pérez", role: "Gerente Junior", siteId: "site_bv", active: true, employeeTypeId: "et_gj", employmentStatus: "activo" },
  { id: "emp_tc", code: "BV-003", name: "Camila Rojas", role: "Empleado", siteId: "site_bv", active: true, employeeTypeId: "et_tc", employmentStatus: "activo" },
  { id: "emp_x1", code: "BV-010", name: "Sara Molina", role: "Empleado", siteId: "site_bv", active: true, employeeTypeId: null, employmentStatus: "activo" },
  { id: "emp_x2", code: "BV-011", name: "Sara Gómez", role: "Empleado", siteId: "site_bv", active: true, employeeTypeId: null, employmentStatus: "activo" },
];
const planView = () => ({
  site: SITE,
  weekStart: "2026-11-09",
  dates: ["2026-11-09", "2026-11-10", "2026-11-11", "2026-11-12", "2026-11-13", "2026-11-14", "2026-11-15"],
  plan: { id: "plan1", status: "borrador", version: 1, submittedBy: null, decidedBy: null, comment: null, changeReason: null },
  approved: null,
  versions: [{ version: 1, status: "borrador" }],
  employees: EMPLOYEES.slice(0, 2).map((e) => ({ id: e.id, code: e.code, name: e.name, role: e.role, typeName: "Tipo", isLead: e.id === "emp_gj", weeklyHours: 42, minWeeklyHours: null, missing: [], guestFrom: null, awayDates: [] })),
  cells: [{ employeeId: "emp_gj", date: "2026-11-09", kind: "turno", startHm: "07:00", endHm: "15:00", lunchMin: 30, note: null }],
  totals: { emp_gj: 450 },
  novelties: [],
  coverage: [{ date: "2026-11-15", fromHm: "07:00", toHm: "22:00" }],
  opensHm: "07:00",
  closesHm: "22:00",
  hoursConfirmed: true,
  warnings: [{ employeeId: null, message: "advertencia de prueba" }],
});

let relojServer;
let relojUrl;
const requests = [];

function startReloj() {
  relojServer = createServer(async (req, res) => {
    let raw = "";
    for await (const c of req) raw += c;
    const url = new URL(req.url, "http://x");
    const path = url.pathname.replace("/api/v1/", "");
    const body = raw ? JSON.parse(raw) : undefined;
    requests.push({ method: req.method, path, query: Object.fromEntries(url.searchParams), auth: req.headers.authorization ?? null, key: req.headers["x-api-key"] ?? null, body });
    const send = (status, data) => res.writeHead(status, { "content-type": "application/json" }).end(JSON.stringify(data));
    const who = tokenInfo.get((req.headers.authorization || "").replace("Bearer ", ""));

    if (path === "auth/login") {
      const u = USERS[body.email];
      if (!u || body.password !== PASS) return send(401, { error: "Credenciales inválidas", code: "INVALID_CREDENTIALS" });
      if (u.totp && !body.totp) return send(401, { error: "Se requiere TOTP", code: "TOTP_REQUIRED" });
      if (u.totp && body.totp !== u.totp) return send(401, { error: "TOTP inválido", code: "INVALID_TOTP" });
      const token = fakeJwt(body.email, u.role);
      tokenInfo.set(token, { email: body.email, role: u.role });
      return send(200, { token, user: { id: "u", email: body.email, name: body.email, role: u.role, scopeType: "site", scopeId: "site_bv" }, expiresHours: 12 });
    }
    if (path === "permissions") return who ? send(200, { role: who.role, permissions: PERMS[who.role] }) : send(401, { error: "No autorizado" });
    if (!who && req.headers["x-api-key"] !== API_KEY) return send(401, { error: "No autorizado", code: "AUTH_REQUIRED" });

    if (path === "sites") return send(200, { sites: [SITE], countries: [], zones: [] });
    if (path === "employees" && req.method === "GET") return send(200, { employees: EMPLOYEES });
    if (path === "plans" && req.method === "GET") return send(200, planView());
    if (path === "plans" && req.method === "POST") return send(201, planView());
    if (path === "plans/plan1" && req.method === "PUT") return send(200, planView());
    if (path === "plans/plan1" && req.method === "POST") {
      if (body.action === "approve" && who?.role !== "zone_manager") return send(403, { error: "Permiso insuficiente para esta acción", code: "FORBIDDEN" });
      return send(200, planView());
    }
    if (path === "novelties" && req.method === "POST") return send(201, { novelty: { id: "n1", kind: body.kind, type: body.type, employeeId: body.employeeId, employeeName: "Laura Pérez", siteId: "site_bv", startDate: body.startDate, endDate: body.endDate, status: "registrada", createdBy: who?.email } });
    if (path === "hours") {
      return send(200, {
        weekStart: "2026-11-09",
        cutAt: "2026-11-12T00:00:00Z",
        rows: [{ employeeId: "emp_gj", employeeName: "Laura Pérez", siteName: "Buenavista", typeName: "Gerente Junior", salary: 4500000, referenceMin: 2520, minimumMin: null, plannedMin: 2700, workedMin: 2760, lunchMin: 180, diffMin: 60, excessMin: 240, shortfallMin: 0, restDays: 1, incidents: 0, days: [], excessNovelty: null, pendingReview: true }],
      });
    }
    if (path === "employee-types") return send(200, { types: [{ id: "et_gj", name: "Gerente Junior" }, { id: "et_tc", name: "Empleado General Tiempo Completo" }] });
    if (path.startsWith("employees/") && req.method === "PATCH") return send(200, { employee: { id: "emp_tc", name: "Camila Rojas", documentId: body.documentId ?? null, employeeTypeId: body.employeeTypeId ?? null, employmentStatus: body.employmentStatus ?? "activo" } });
    return send(404, { error: `ruta de prueba no implementada: ${path}` });
  });
  return new Promise((resolve) => relojServer.listen(0, "127.0.0.1", () => resolve(`http://127.0.0.1:${relojServer.address().port}`)));
}

/* ───────── Servidor MCP bajo prueba ───────── */
let mcp;
let mcpUrl;
const freePort = () =>
  new Promise((resolve) => {
    const s = createServer().listen(0, "127.0.0.1", () => {
      const { port } = s.address();
      s.close(() => resolve(port));
    });
  });

before(async () => {
  relojUrl = await startReloj();
  const port = await freePort();
  mcpUrl = `http://localhost:${port}`;
  mcp = spawn(process.execPath, [SERVER, "--http"], {
    env: { ...process.env, RELOJ_API_URL: relojUrl, RELOJ_API_KEY: API_KEY, MCP_AUTH_TOKEN: MCP_TOKEN, MCP_PORT: String(port), MCP_PUBLIC_URL: mcpUrl },
    stdio: ["ignore", "ignore", "pipe"],
  });
  for (let i = 0; i < 50; i += 1) {
    try {
      if ((await fetch(`${mcpUrl}/healthz`)).ok) return;
    } catch {
      /* aún arrancando */
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error("El servidor MCP no arrancó");
});

after(() => {
  mcp?.kill();
  relojServer?.close();
});

/* ───────── Ayudas de OAuth y MCP ───────── */
async function register() {
  const res = await fetch(`${mcpUrl}/register`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ redirect_uris: ["https://cliente.test/cb"], client_name: "Cliente de prueba" }) });
  return (await res.json()).client_id;
}
const pkce = () => {
  const verifier = randomBytes(32).toString("base64url");
  return { verifier, challenge: createHash("sha256").update(verifier).digest("base64url") };
};
async function authorizeRaw(form) {
  return fetch(`${mcpUrl}/authorize`, { method: "POST", redirect: "manual", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams(form) });
}
/** Flujo completo: devuelve { access_token } o la respuesta fallida. */
async function login(email, { password = PASS, totp } = {}) {
  const client_id = await register();
  const { verifier, challenge } = pkce();
  const res = await authorizeRaw({ client_id, redirect_uri: "https://cliente.test/cb", response_type: "code", code_challenge: challenge, code_challenge_method: "S256", state: "xyz", email, password, ...(totp ? { totp } : {}) });
  if (res.status !== 302) return { res, html: await res.text() };
  const code = new URL(res.headers.get("location")).searchParams.get("code");
  const tok = await fetch(`${mcpUrl}/token`, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ grant_type: "authorization_code", code, client_id, redirect_uri: "https://cliente.test/cb", code_verifier: verifier }) });
  return { ...(await tok.json()), status: tok.status, code, client_id, verifier };
}
async function connect(bearer) {
  const client = new Client({ name: "prueba", version: "1" });
  await client.connect(new StreamableHTTPClientTransport(new URL(`${mcpUrl}/mcp`), { requestInit: { headers: { Authorization: `Bearer ${bearer}` } } }));
  return client;
}
const toolNames = async (client) => (await client.listTools()).tools.map((t) => t.name);
const call = async (client, name, args) => client.callTool({ name, arguments: args });
const text = (r) => r.content.map((c) => c.text).join("\n");

/* ───────── Pruebas ───────── */
describe("OAuth con usuario de Reloj", () => {
  test("pantalla de autorización pide correo y contraseña, no el token del servidor", async () => {
    const client_id = await register();
    const { challenge } = pkce();
    const q = new URLSearchParams({ client_id, redirect_uri: "https://cliente.test/cb", response_type: "code", code_challenge: challenge, code_challenge_method: "S256" });
    const html = await (await fetch(`${mcpUrl}/authorize?${q}`)).text();
    assert.match(html, /name="email"/);
    assert.match(html, /name="password"/);
    assert.match(html, /como usted/);
    assert.doesNotMatch(html, /Token de acceso/);
  });

  test("credenciales incorrectas no emiten código", async () => {
    const r = await login("gerente@t", { password: "mala" });
    assert.equal(r.res.status, 401);
    assert.match(r.html, /incorrectos/);
  });

  test("cuenta con TOTP: pide el código y lo valida", async () => {
    const sin = await login("totp@t");
    assert.equal(sin.res.status, 401);
    assert.match(sin.html, /name="totp"/);
    const mal = await login("totp@t", { totp: "000000" });
    assert.match(mal.html, /incorrecto/);
    const ok = await login("totp@t", { totp: "123456" });
    assert.ok(ok.access_token);
  });

  test("el access token vence con la sesión de Reloj (≤ 12 h) y no hay refresh token", async () => {
    const r = await login("gerente@t");
    assert.ok(r.expires_in > 11 * 3600 && r.expires_in <= 12 * 3600, `expires_in=${r.expires_in}`);
    assert.equal(r.refresh_token, undefined);
    const meta = await (await fetch(`${mcpUrl}/.well-known/oauth-authorization-server`)).json();
    assert.deepEqual(meta.grant_types_supported, ["authorization_code"]);
  });

  test("el access token no deja ver el JWT de Reloj (va cifrado)", async () => {
    const r = await login("gerente@t");
    const decoded = Buffer.from(r.access_token, "base64url").toString("latin1");
    assert.ok(!decoded.includes("gerente@t"));
    assert.ok(!decoded.includes("h.eyJ"));
  });

  test("código de un solo uso, PKCE obligatorio y refresh_token rechazado", async () => {
    const r = await login("gerente@t");
    const again = await fetch(`${mcpUrl}/token`, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ grant_type: "authorization_code", code: r.code, client_id: r.client_id, redirect_uri: "https://cliente.test/cb", code_verifier: r.verifier }) });
    assert.equal(again.status, 400);
    const refresh = await fetch(`${mcpUrl}/token`, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: "x" }) });
    assert.equal(refresh.status, 400);

    const client_id = await register();
    const { challenge } = pkce();
    const a = await authorizeRaw({ client_id, redirect_uri: "https://cliente.test/cb", response_type: "code", code_challenge: challenge, code_challenge_method: "S256", email: "gerente@t", password: PASS });
    const code = new URL(a.headers.get("location")).searchParams.get("code");
    const bad = await fetch(`${mcpUrl}/token`, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ grant_type: "authorization_code", code, client_id, redirect_uri: "https://cliente.test/cb", code_verifier: "otro-verificador" }) });
    assert.equal(bad.status, 400);
  });

  test("un token inventado recibe 401 con el desafío OAuth", async () => {
    const res = await fetch(`${mcpUrl}/mcp`, { method: "POST", headers: { authorization: "Bearer inventado", "content-type": "application/json", accept: "application/json, text/event-stream" }, body: "{}" });
    assert.equal(res.status, 401);
    assert.match(res.headers.get("www-authenticate"), /resource_metadata/);
  });
});

describe("Herramientas según el rol", () => {
  const WRITE = ["crear_cronograma", "guardar_turnos", "enviar_cronograma", "aprobar_cronograma", "devolver_cronograma", "registrar_novedad", "decidir_novedad", "habilitar_tienda", "autorizar_movilidad", "revocar_acceso", "fijar_horario_tienda", "actualizar_ficha_laboral"];

  test("gerente de tienda: programa y envía, pero no aprueba ni concede accesos", async () => {
    const c = await connect((await login("gerente@t")).access_token);
    const names = await toolNames(c);
    for (const n of ["ver_cronograma", "crear_cronograma", "guardar_turnos", "enviar_cronograma", "registrar_novedad", "horas_semanales", "listar_novedades"]) assert.ok(names.includes(n), `falta ${n}`);
    for (const n of ["aprobar_cronograma", "devolver_cronograma", "decidir_novedad", "habilitar_tienda", "autorizar_movilidad", "fijar_horario_tienda", "actualizar_ficha_laboral"]) assert.ok(!names.includes(n), `no debería tener ${n}`);
    await c.close();
  });

  test("regional: además aprueba, devuelve, decide y autoriza", async () => {
    const c = await connect((await login("regional@t")).access_token);
    const names = await toolNames(c);
    for (const n of ["aprobar_cronograma", "devolver_cronograma", "decidir_novedad", "habilitar_tienda", "autorizar_movilidad", "revocar_acceso", "fijar_horario_tienda"]) assert.ok(names.includes(n), `falta ${n}`);
    assert.ok(!names.includes("actualizar_ficha_laboral"));
    await c.close();
  });

  test("RR. HH.: ficha laboral, sin planificar ni aprobar", async () => {
    const c = await connect((await login("rrhh@t")).access_token);
    const names = await toolNames(c);
    assert.ok(names.includes("actualizar_ficha_laboral"));
    assert.ok(!names.includes("guardar_turnos") && !names.includes("aprobar_cronograma"));
    await c.close();
  });

  test("operador (coordinador): sin planificación ni horas", async () => {
    const c = await connect((await login("operador@t")).access_token);
    const names = await toolNames(c);
    assert.ok(names.includes("mi_perfil"));
    for (const n of [...WRITE, "ver_cronograma", "horas_semanales", "listar_novedades"]) assert.ok(!names.includes(n), `no debería tener ${n}`);
    await c.close();
  });

  test("clave de integración (Bearer estático): solo lectura y con x-api-key", async () => {
    const c = await connect(MCP_TOKEN);
    const names = await toolNames(c);
    for (const n of WRITE) assert.ok(!names.includes(n), `no debería tener ${n}`);
    assert.ok(names.includes("ver_cronograma"));
    requests.length = 0;
    await call(c, "ver_cronograma", { sede: "BAQ-BV" });
    assert.ok(requests.every((r) => r.auth === null && r.key === API_KEY));
    assert.match(text(await call(c, "mi_perfil", {})), /solo lectura/);
    await c.close();
  });

  test("las anotaciones distinguen lectura de escritura", async () => {
    const c = await connect((await login("regional@t")).access_token);
    const tools = Object.fromEntries((await c.listTools()).tools.map((t) => [t.name, t]));
    assert.equal(tools.ver_cronograma.annotations.readOnlyHint, true);
    assert.equal(tools.guardar_turnos.annotations.readOnlyHint, false);
    assert.equal(tools.decidir_novedad.annotations.destructiveHint, true);
    await c.close();
  });
});

describe("Acciones con la identidad del usuario", () => {
  test("guardar_turnos usa el JWT del usuario, resuelve el código y aplica almuerzo de 30 por defecto", async () => {
    const jwt = (await login("gerente@t")).access_token;
    const c = await connect(jwt);
    requests.length = 0;
    const r = await call(c, "guardar_turnos", { sede: "Buenavista", celdas: [{ empleado: "BV-001", fechas: ["2026-11-09", "2026-11-10"], tipo: "turno", entrada: "07:00", salida: "15:00" }, { empleado: "Camila", fechas: ["2026-11-15"], tipo: "descanso" }] });
    assert.ok(!r.isError, text(r));
    const put = requests.find((x) => x.method === "PUT");
    assert.equal(put.path, "plans/plan1");
    assert.match(put.auth, /^Bearer h\./, "debe ir el JWT del usuario, no la clave de integración");
    assert.equal(put.key, null);
    assert.equal(put.body.cells.length, 3);
    assert.deepEqual(put.body.cells[0], { employeeId: "emp_gj", date: "2026-11-09", kind: "turno", startHm: "07:00", endHm: "15:00", lunchMin: 30, note: null });
    assert.equal(put.body.cells[2].employeeId, "emp_tc");
    assert.equal(put.body.cells[2].kind, "descanso");
    const view = JSON.parse(text(r));
    assert.equal(view.empleados[0].turnos["2026-11-09"], "07:00-15:00 · almuerzo 30 min");
    assert.deepEqual(view.franjas_sin_responsable, ["2026-11-15 07:00-22:00"]);
    await c.close();
  });

  test("un turno sin salida y un nombre ambiguo se rechazan antes de llamar a Reloj", async () => {
    const c = await connect((await login("gerente@t")).access_token);
    requests.length = 0;
    const sinSalida = await call(c, "guardar_turnos", { sede: "BAQ-BV", celdas: [{ empleado: "BV-001", fechas: ["2026-11-09"], tipo: "turno", entrada: "07:00" }] });
    assert.ok(sinSalida.isError);
    assert.match(text(sinSalida), /entrada y salida|ambas/i);
    const ambiguo = await call(c, "registrar_novedad", { clase: "programada", tipo: "vacaciones", empleado: "Sara", desde: "2026-11-12" });
    assert.ok(ambiguo.isError);
    assert.match(text(ambiguo), /ambiguo/);
    assert.ok(!requests.some((x) => x.method === "PUT" || (x.method === "POST" && x.path === "novelties")));
    await c.close();
  });

  test("aprobar exige confirmado=true; sin él no se llama a Reloj", async () => {
    const c = await connect((await login("regional@t")).access_token);
    requests.length = 0;
    const sin = await call(c, "aprobar_cronograma", { sede: "BAQ-BV" });
    assert.ok(sin.isError);
    assert.ok(!requests.some((x) => x.method === "POST" && x.path === "plans/plan1"));
    const con = await call(c, "aprobar_cronograma", { sede: "BAQ-BV", comentario: "OK", confirmado: true });
    assert.ok(!con.isError, text(con));
    const post = requests.find((x) => x.method === "POST" && x.path === "plans/plan1");
    assert.deepEqual(post.body, { action: "approve", comment: "OK" });
    await c.close();
  });

  test("si Reloj rechaza la acción, el modelo recibe el motivo", async () => {
    // La herramienta existe porque la sesión era de regional; si el rol cambia en Reloj durante la sesión,
    // Reloj manda: el rechazo llega tal cual al modelo.
    const sesion = await login("regional@t");
    const c = await connect(sesion.access_token);
    for (const [jwt, info] of tokenInfo) if (info.email === "regional@t") tokenInfo.set(jwt, { ...info, role: "site_manager" });
    const r = await call(c, "aprobar_cronograma", { sede: "BAQ-BV", confirmado: true });
    assert.ok(r.isError);
    assert.match(text(r), /rechazó la solicitud \(403 FORBIDDEN\): Permiso insuficiente/);
    await c.close();
  });

  test("las horas nunca incluyen el salario", async () => {
    const c = await connect((await login("rrhh@t")).access_token);
    const r = await call(c, "horas_semanales", { semana: "2026-11-12" });
    const out = text(r);
    assert.ok(!/salary|salario|4500000/i.test(out), "el salario no debe salir hacia el modelo");
    const row = JSON.parse(out).empleados[0];
    assert.equal(row.trabajadas_netas_h, "46:00");
    assert.equal(row.almuerzo_excluido_h, "3:00");
    assert.equal(row.exceso_h, "4:00");
    await c.close();
  });

  test("actualizar_ficha_laboral traduce el nombre del tipo de jornada a su id", async () => {
    const c = await connect((await login("rrhh@t")).access_token);
    requests.length = 0;
    const r = await call(c, "actualizar_ficha_laboral", { empleado: "BV-003", identificacion: "CC-123456", tipo_jornada: "Empleado General Tiempo Completo", confirmado: true });
    assert.ok(!r.isError, text(r));
    const patch = requests.find((x) => x.method === "PATCH");
    assert.deepEqual(patch.body, { documentId: "CC-123456", employeeTypeId: "et_tc" });
    const malo = await call(c, "actualizar_ficha_laboral", { empleado: "BV-003", tipo_jornada: "Inexistente", confirmado: true });
    assert.ok(malo.isError);
    assert.match(text(malo), /Opciones/);
    await c.close();
  });

  test("una fecha inexistente se rechaza con un mensaje claro, sin llamar a Reloj", async () => {
    const c = await connect((await login("gerente@t")).access_token);
    requests.length = 0;
    const r = await call(c, "ver_cronograma", { sede: "BAQ-BV", semana: "2026-02-31" });
    assert.ok(r.isError);
    assert.match(text(r), /Fecha inválida/);
    assert.ok(!requests.some((x) => x.path === "plans"));
    const ok = await call(c, "ver_cronograma", { sede: "BAQ-BV", semana: "2026-11-12" });
    assert.ok(!ok.isError);
    await c.close();
  });

  test("mi_perfil muestra el rol y los permisos del usuario", async () => {
    const c = await connect((await login("gerente@t")).access_token);
    const perfil = JSON.parse(text(await call(c, "mi_perfil", {})));
    assert.equal(perfil.rol, "site_manager");
    assert.ok(perfil.permisos.includes("plan.edit") && !perfil.permisos.includes("plan.decide"));
    await c.close();
  });
});
