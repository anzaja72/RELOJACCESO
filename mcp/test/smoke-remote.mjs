// Verificación de un servidor MCP YA DESPLEGADO, sin credenciales de Reloj y sin escribir nada.
//   MCP_URL=https://timermcp.leia-softwarelab.tech node mcp/test/smoke-remote.mjs
//   (opcional) MCP_TOKEN=<MCP_AUTH_TOKEN> para comprobar además que el acceso estático es de solo lectura.
// Comprueba que está corriendo la versión 2 (OAuth con usuario de Reloj, sin refresh token) y que
// protege /mcp. Con el servidor MCP anterior falla en la comprobación 2.
import { createHash, randomBytes } from "node:crypto";

const base = (process.env.MCP_URL || "http://localhost:3333").replace(/\/$/, "");
let fallos = 0;
const check = (ok, msg, detalle = "") => {
  console.log(`${ok ? "  ✓" : "  ✗"} ${msg}${!ok && detalle ? ` — ${detalle}` : ""}`);
  if (!ok) fallos += 1;
};
const get = async (path, init) => {
  try {
    return await fetch(base + path, init);
  } catch (e) {
    return { ok: false, status: 0, text: async () => String(e.message), headers: new Headers(), json: async () => ({}) };
  }
};

console.log(`Servidor MCP: ${base}`);

const health = await get("/healthz");
check(health.status === 200, "1. /healthz responde 200", `HTTP ${health.status}`);

const metaRes = await get("/.well-known/oauth-authorization-server");
let meta = {};
try {
  meta = await metaRes.json();
} catch {
  /* no es JSON: versión anterior o ruta mal enrutada */
}
check(
  JSON.stringify(meta.grant_types_supported) === JSON.stringify(["authorization_code"]),
  "2. Es la versión 2: solo authorization_code (sin refresh token)",
  `grant_types=${JSON.stringify(meta.grant_types_supported)} (HTTP ${metaRes.status})`,
);
check(String(meta.issuer || "").startsWith("https://") || base.startsWith("http://localhost"), "3. El emisor OAuth es una URL https pública", `issuer=${meta.issuer}`);
check(Boolean(meta.registration_endpoint && meta.authorization_endpoint && meta.token_endpoint), "4. Anuncia registro, autorización y token");

const sinToken = await get("/mcp", { method: "POST", headers: { "content-type": "application/json", accept: "application/json, text/event-stream" }, body: "{}" });
check(sinToken.status === 401, "5. /mcp sin credenciales responde 401", `HTTP ${sinToken.status}`);
check(/resource_metadata/.test(sinToken.headers.get("www-authenticate") || ""), "6. El 401 incluye el desafío OAuth (resource_metadata)");

const inventado = await get("/mcp", { method: "POST", headers: { authorization: "Bearer inventado", "content-type": "application/json", accept: "application/json, text/event-stream" }, body: "{}" });
check(inventado.status === 401, "7. Un token inventado también recibe 401", `HTTP ${inventado.status}`);

// Registro dinámico (sin estado: no guarda nada) y pantalla de autorización.
const reg = await get("/register", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ redirect_uris: ["https://verificacion.invalid/cb"], client_name: "verificación" }) });
const cliente = reg.status === 201 ? await reg.json() : {};
check(Boolean(cliente.client_id), "8. El registro dinámico de clientes funciona", `HTTP ${reg.status}`);
if (cliente.client_id) {
  const challenge = createHash("sha256").update(randomBytes(32)).digest("base64url");
  const q = new URLSearchParams({ client_id: cliente.client_id, redirect_uri: "https://verificacion.invalid/cb", response_type: "code", code_challenge: challenge, code_challenge_method: "S256" });
  const html = await (await get(`/authorize?${q}`)).text();
  check(/name="email"/.test(html) && /name="password"/.test(html), "9. La pantalla de autorización pide correo y contraseña de Reloj CR");
  check(!/Token de acceso/.test(html), "10. Ya no pide el token del servidor como contraseña");
  check(/como usted/.test(html), "11. Explica que actúa con los permisos de la persona");
}

if (process.env.MCP_TOKEN) {
  // Acceso estático: solo lectura. Se usa el SDK solo si está instalado (cd mcp && npm install).
  try {
    const { Client } = await import("@modelcontextprotocol/sdk/client/index.js");
    const { StreamableHTTPClientTransport } = await import("@modelcontextprotocol/sdk/client/streamableHttp.js");
    const c = new Client({ name: "smoke", version: "1" });
    await c.connect(new StreamableHTTPClientTransport(new URL(`${base}/mcp`), { requestInit: { headers: { Authorization: `Bearer ${process.env.MCP_TOKEN}` } } }));
    const names = (await c.listTools()).tools.map((t) => t.name);
    await c.close();
    const escritura = ["guardar_turnos", "crear_cronograma", "aprobar_cronograma", "enviar_cronograma", "decidir_novedad", "autorizar_movilidad"].filter((n) => names.includes(n));
    check(names.includes("ver_cronograma"), "12. El token estático ve herramientas de lectura nuevas (ver_cronograma)");
    check(escritura.length === 0, "13. El token estático NO ofrece herramientas de escritura", escritura.join(", "));
  } catch (e) {
    check(false, "12. El token estático permite listar herramientas", e.message);
  }
} else {
  console.log("  · (omitido) 12-13: defina MCP_TOKEN para verificar el acceso estático de solo lectura");
}

console.log(fallos ? `\n✗ ${fallos} comprobación(es) fallaron` : "\n✔ El servidor MCP desplegado es la versión 2 y está protegido");
process.exit(fallos ? 1 : 0);
