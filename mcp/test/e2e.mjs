// Prueba de extremo a extremo del MCP contra un Reloj CR REAL (instancia de pruebas con `npm run seed:tiendas`).
// Levanta el servidor MCP, autoriza por OAuth con usuarios de Reloj y recorre el flujo de turnos completo.
//   BASE=http://localhost:47321 PASSWORD='<ADMIN_PASSWORD>' node mcp/test/e2e.mjs
// Escribe cronogramas, novedades y accesos de prueba: no lo ejecute contra producción.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { createServer } from "node:http";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const BASE = (process.env.BASE || "http://localhost:47321").replace(/\/$/, "");
const PASSWORD = process.env.PASSWORD;
const local = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(BASE);
if (!local && process.env.ALLOW_REMOTE !== "1") throw new Error(`BASE=${BASE} no es local: este script escribe datos de prueba.`);
if (!PASSWORD) throw new Error("Defina PASSWORD (la ADMIN_PASSWORD de la instancia de pruebas).");

const port = await new Promise((r) => {
  const s = createServer().listen(0, "127.0.0.1", () => {
    const { port: p } = s.address();
    s.close(() => r(p));
  });
});
const MCP = `http://localhost:${port}`;
const child = spawn(process.execPath, [fileURLToPath(new URL("../server.mjs", import.meta.url)), "--http"], {
  env: { ...process.env, RELOJ_API_URL: BASE, MCP_AUTH_TOKEN: randomBytes(24).toString("hex"), MCP_PORT: String(port), MCP_PUBLIC_URL: MCP },
  stdio: ["ignore", "ignore", "inherit"],
});
for (let i = 0; i < 50; i += 1) {
  try {
    if ((await fetch(`${MCP}/healthz`)).ok) break;
  } catch {
    /* arrancando */
  }
  await new Promise((r) => setTimeout(r, 100));
}

async function connectAs(email) {
  const reg = await (await fetch(`${MCP}/register`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ redirect_uris: ["https://x.test/cb"], client_name: "e2e" }) })).json();
  const verifier = randomBytes(32).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  const a = await fetch(`${MCP}/authorize`, {
    method: "POST",
    redirect: "manual",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: reg.client_id, redirect_uri: "https://x.test/cb", response_type: "code", code_challenge: challenge, code_challenge_method: "S256", email, password: PASSWORD }),
  });
  assert.equal(a.status, 302, `no se pudo autorizar a ${email} (${a.status}); ¿usuarios de seed:tiendas y contraseña correcta?`);
  const code = new URL(a.headers.get("location")).searchParams.get("code");
  const tok = await (await fetch(`${MCP}/token`, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ grant_type: "authorization_code", code, client_id: reg.client_id, redirect_uri: "https://x.test/cb", code_verifier: verifier }) })).json();
  const client = new Client({ name: "e2e", version: "1" });
  await client.connect(new StreamableHTTPClientTransport(new URL(`${MCP}/mcp`), { requestInit: { headers: { Authorization: `Bearer ${tok.access_token}` } } }));
  return client;
}
const call = async (c, name, args = {}) => {
  const r = await c.callTool({ name, arguments: args });
  const text = r.content.map((x) => x.text).join("\n");
  return { error: Boolean(r.isError), text, json: r.isError ? null : JSON.parse(text) };
};
let step = 0;
const ok = (msg) => console.log(`  ✓ ${String(++step).padStart(2, "0")} ${msg}`);

try {
  console.log("Gerente de tienda (buenavista@reloj.cr)");
  const gerente = await connectAs("buenavista@reloj.cr");
  const perfil = (await call(gerente, "mi_perfil")).json;
  assert.equal(perfil.rol, "site_manager");
  ok(`sesión como ${perfil.correo} con ${perfil.permisos.length} permisos`);

  let view = (await call(gerente, "ver_cronograma", { sede: "Buenavista" })).json;
  if (!view.cronograma) view = (await call(gerente, "crear_cronograma", { sede: "BAQ-BV" })).json;
  assert.equal(view.cronograma.estado, "borrador");
  ok(`cronograma v${view.cronograma.version} en borrador, semana del ${view.semana.inicia}`);

  const lunes = view.semana.dias;
  view = (
    await call(gerente, "guardar_turnos", {
      sede: "BAQ-BV",
      celdas: [
        { empleado: "BV-001", fechas: lunes.slice(0, 6), tipo: "turno", entrada: "07:00", salida: "15:00" },
        { empleado: "BV-001", fechas: [lunes[6]], tipo: "descanso" },
        { empleado: "BV-002", fechas: lunes.slice(0, 6), tipo: "turno", entrada: "14:00", salida: "22:00" },
      ],
    })
  ).json;
  const laura = view.empleados.find((e) => e.codigo === "BV-001");
  assert.equal(laura.horas_programadas, "45:00");
  assert.ok(view.franjas_sin_responsable.some((f) => f.startsWith(lunes[6])), "el domingo debe quedar sin responsable");
  assert.ok(view.advertencias.some((w) => /42 h/.test(w)));
  ok(`turnos guardados: Laura ${laura.horas_programadas}, ${view.franjas_sin_responsable.length} franja(s) sin responsable, ${view.advertencias.length} advertencia(s)`);

  const noConf = await call(gerente, "enviar_cronograma", { sede: "BAQ-BV" });
  assert.ok(noConf.error, "enviar sin confirmado debe fallar");
  view = (await call(gerente, "enviar_cronograma", { sede: "BAQ-BV", confirmado: true })).json;
  assert.equal(view.cronograma.estado, "enviado");
  ok("enviado al gerente regional (exigió confirmación)");

  const nombres = (await gerente.listTools()).tools.map((t) => t.name);
  assert.ok(!nombres.includes("aprobar_cronograma"));
  ok("el gerente de tienda no ve la herramienta de aprobar");

  const vac = (await call(gerente, "registrar_novedad", { clase: "programada", tipo: "vacaciones", empleado: "BV-001", desde: lunes[3], hasta: lunes[4] })).json;
  assert.equal(vac.estado, "registrada");
  const sinCausa = await call(gerente, "registrar_novedad", { clase: "urgente", tipo: "cobertura_urgente", empleado: "BV-002", desde: lunes[2] });
  assert.ok(sinCausa.error && /causa/i.test(sinCausa.text));
  ok("novedad programada registrada; la urgente sin causa fue rechazada por Reloj");

  console.log("Gerente regional (ivan@reloj.cr)");
  const regional = await connectAs("ivan@reloj.cr");
  const region = (await call(regional, "cronogramas_region")).json;
  assert.ok(region.some((r) => /Buenavista/.test(r.tienda) && /enviado/.test(r.estado)));
  ok("ve el cronograma de Buenavista pendiente de revisión");

  const devuelto = await call(regional, "devolver_cronograma", { sede: "BAQ-BV", observaciones: "Falta cubrir el domingo", confirmado: true });
  assert.equal(devuelto.json.cronograma.estado, "devuelto");
  ok("lo devuelve con observaciones");
  view = (await call(gerente, "ver_cronograma", { sede: "BAQ-BV" })).json;
  assert.equal(view.cronograma.observaciones, "Falta cubrir el domingo");
  await call(gerente, "guardar_turnos", { sede: "BAQ-BV", celdas: [{ empleado: "BV-002", fechas: [lunes[6]], tipo: "turno", entrada: "07:00", salida: "22:00" }] });
  await call(gerente, "enviar_cronograma", { sede: "BAQ-BV", confirmado: true });
  const aprobado = await call(regional, "aprobar_cronograma", { sede: "BAQ-BV", comentario: "Aprobado", confirmado: true });
  assert.equal(aprobado.json.cronograma.estado, "aprobado");
  ok("el gerente corrige, reenvía y el regional aprueba");

  const mov = await call(regional, "autorizar_movilidad", { empleado: "BV-001", sede_destino: "BAQ-AP", desde: lunes[3], hasta: lunes[4], motivo: "cobertura", confirmado: true });
  assert.ok(!mov.error, mov.text);
  const acc = await call(regional, "habilitar_tienda", { empleado: "BV-005", sede: "BAQ-AP", habilitado: true, confirmado: true });
  assert.ok(!acc.error, acc.text);
  const accesos = (await call(regional, "listar_accesos")).json;
  assert.ok(accesos.some((a) => a.tipo === "movilidad") && accesos.some((a) => a.tipo === "permanente"));
  for (const a of accesos.filter((x) => !x.revocado)) await call(regional, "revocar_acceso", { id: a.id, confirmado: true });
  ok("movilidad y acceso concedidos y revocados (quedan en el historial)");

  const horas = await call(regional, "horas_semanales", { revision: "pendiente" });
  assert.ok(!/salary|salario/i.test(horas.text));
  ok("horas de la semana consultadas; sin salarios en la respuesta");

  const gerenteAjeno = await call(gerente, "ver_cronograma", { sede: "BAQ-AP" });
  assert.ok(gerenteAjeno.error);
  ok(`el gerente de Buenavista no puede ver Alto Prado: «${gerenteAjeno.text.slice(0, 80)}…»`);

  console.log("Coordinador (coordinador@reloj.cr)");
  const coord = await connectAs("coordinador@reloj.cr");
  const tools = (await coord.listTools()).tools.map((t) => t.name);
  assert.ok(!tools.includes("ver_cronograma") && !tools.includes("guardar_turnos") && !tools.includes("horas_semanales"));
  ok("sin herramientas de planificación ni de horas");

  console.log("Auditoría");
  const login = await (await fetch(`${BASE}/api/v1/auth/login`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: "ivan@reloj.cr", password: PASSWORD }) })).json();
  const { events } = await (await fetch(`${BASE}/api/events`, { headers: { authorization: `Bearer ${login.token}` } })).json();
  const decidido = events.find((e) => e.type === "plan.decided" && e.payload.after === "aprobado");
  assert.equal(decidido?.actor, "ivan@reloj.cr", "la aprobación debe quedar a nombre de la persona, no de una clave compartida");
  ok(`la aprobación quedó auditada a nombre de ${decidido.actor}`);

  console.log(`\n✔ E2E completo (${step} verificaciones)`);
} finally {
  child.kill();
}
