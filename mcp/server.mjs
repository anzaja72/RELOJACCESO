#!/usr/bin/env node
// Servidor MCP de Reloj CR. Envuelve la API REST /api/v1 con la identidad de CADA usuario.
//   stdio (Claude Desktop / Claude Code):  node mcp/server.mjs
//   HTTP  (ChatGPT / Claude web, URL remota): node mcp/server.mjs --http
//
// Identidad y permisos
//   · HTTP + OAuth: la persona inicia sesión con su usuario de Reloj CR; todo se hace con SUS permisos
//     y queda en la auditoría a su nombre. Puede leer y, según su rol, escribir (turnos, novedades…).
//   · HTTP + token estático (MCP_AUTH_TOKEN como Bearer): acceso de integración de SOLO LECTURA, con la
//     clave RELOJ_API_KEY. Sirve para Claude Code / mcp-remote.
//   · stdio: RELOJ_EMAIL + RELOJ_PASSWORD (usuario, lectura y escritura) o RELOJ_API_KEY (solo lectura).
//
// Variables: RELOJ_API_URL (def. http://127.0.0.1:47321), RELOJ_API_KEY, RELOJ_EMAIL, RELOJ_PASSWORD,
//            RELOJ_TOTP (solo si la cuenta tiene verificación en dos pasos), MCP_AUTH_TOKEN (obligatorio
//            en --http), MCP_PORT (def. 3333), MCP_PUBLIC_URL (URL pública https, para OAuth).
import { createServer } from "node:http";
import { pathToFileURL } from "node:url";
import { timingSafeEqual } from "node:crypto";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createOAuth } from "./oauth.mjs";
import { createReloj, loginReloj } from "./reloj.mjs";
import { INSTRUCTIONS, registerTools } from "./tools.mjs";

const BASE = (process.env.RELOJ_API_URL || "http://127.0.0.1:47321").replace(/\/$/, "");
const API_KEY = process.env.RELOJ_API_KEY || process.env.DEMO_API_KEY || "";

/** Servidor MCP para una identidad concreta (se crea uno por petición en HTTP). */
export function buildServer({ reloj, identity }) {
  const server = new McpServer({ name: "reloj-cr", version: "2.0.0" }, { instructions: INSTRUCTIONS });
  registerTools(server, { reloj, identity });
  return server;
}

const userIdentity = (session) => ({ kind: "user", user: session.user, permissions: new Set(session.permissions) });
const integrationIdentity = { kind: "integration" };

async function main() {
  if (!process.argv.includes("--http")) {
    const email = process.env.RELOJ_EMAIL;
    const password = process.env.RELOJ_PASSWORD;
    let reloj;
    let identity;
    if (email && password) {
      const login = () => loginReloj(BASE, { email, password, totp: process.env.RELOJ_TOTP });
      const session = await login();
      reloj = createReloj({ base: BASE, auth: { kind: "user", token: session.token }, relogin: async () => (await login()).token });
      identity = userIdentity(session);
      console.error(`reloj-cr MCP (stdio) → ${BASE} como ${session.user.email} (${session.user.role})`);
    } else {
      reloj = createReloj({ base: BASE, auth: { kind: "key", key: API_KEY } });
      identity = integrationIdentity;
      console.error(`reloj-cr MCP (stdio) → ${BASE} · SOLO LECTURA (defina RELOJ_EMAIL y RELOJ_PASSWORD para escribir)`);
    }
    await buildServer({ reloj, identity }).connect(new StdioServerTransport());
    return;
  }

  const token = process.env.MCP_AUTH_TOKEN;
  if (!token || token.length < 32) {
    console.error("MCP_AUTH_TOKEN es obligatorio en modo --http (mínimo 32 caracteres): firma y cifra las sesiones OAuth.");
    process.exit(1);
  }
  const expected = Buffer.from(`Bearer ${token}`);
  const isStaticToken = (header = "") => {
    const got = Buffer.from(header);
    return got.length === expected.length && timingSafeEqual(got, expected);
  };

  const port = Number(process.env.MCP_PORT || process.env.PORT || 3333);
  const oauth = createOAuth({
    secret: token,
    publicUrl: process.env.MCP_PUBLIC_URL || `http://localhost:${port}`,
    login: (credentials) => loginReloj(BASE, credentials),
  });

  createServer(async (req, res) => {
    const { pathname } = new URL(req.url, "http://x");
    try {
      if (pathname === "/healthz") return res.writeHead(200).end("ok");
      if (await oauth.handle(req, res, pathname)) return;
      if (pathname !== "/mcp") return res.writeHead(404).end();

      const auth = req.headers.authorization || "";
      let reloj;
      let identity;
      if (isStaticToken(auth)) {
        reloj = createReloj({ base: BASE, auth: { kind: "key", key: API_KEY } });
        identity = integrationIdentity;
      } else {
        const session = oauth.resolveAccessToken(auth.replace(/^Bearer /i, ""));
        if (!session) {
          return res.writeHead(401, { "WWW-Authenticate": oauth.challenge, "Access-Control-Expose-Headers": "WWW-Authenticate" }).end("Unauthorized");
        }
        reloj = createReloj({ base: BASE, auth: { kind: "user", token: session.token } });
        identity = userIdentity(session);
      }

      // Modo sin estado: un servidor+transport por petición.
      const server = buildServer({ reloj, identity });
      const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
      res.on("close", () => {
        transport.close();
        server.close();
      });
      await server.connect(transport);
      await transport.handleRequest(req, res);
    } catch (e) {
      console.error(e);
      if (!res.headersSent) res.writeHead(500).end("Internal error");
    }
  }).listen(port, () => console.error(`reloj-cr MCP (http) en :${port}/mcp → ${BASE}`));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
