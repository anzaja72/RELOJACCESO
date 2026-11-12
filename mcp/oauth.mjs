// OAuth 2.1 para el servidor MCP de Reloj CR, sin base de datos.
//
// Quien autoriza inicia sesión con SU usuario de Reloj CR (correo, contraseña y, si lo tiene, TOTP).
// El servidor guarda esa sesión dentro del propio token, CIFRADA (AES-256-GCM): así cada llamada a
// Reloj se hace con los permisos y el alcance de esa persona, y la auditoría queda a su nombre.
// La contraseña nunca se guarda; solo el JWT que Reloj emitió. La sesión dura lo que dura el JWT de
// Reloj (12 h) y no hay refresh token: pasado ese tiempo hay que autorizar de nuevo.
//
// Los códigos y el client_id viajan firmados/cifrados con una clave derivada de MCP_AUTH_TOKEN, así
// que rotar ese valor invalida todas las sesiones.
// Flujo: descubrimiento → /register (DCR) → /authorize (PKCE S256 + login) → /token.
import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

const b64 = (b) => Buffer.from(b).toString("base64url");
const eq = (a, b) => {
  const x = Buffer.from(String(a));
  const y = Buffer.from(String(b));
  return x.length === y.length && timingSafeEqual(x, y);
};

/** Cifrado autenticado de objetos pequeños (códigos y tokens de acceso). */
export function createSealer(secret) {
  const key = createHmac("sha256", secret).update("reloj-mcp-seal-v2").digest();
  return {
    seal(payload) {
      const iv = randomBytes(12);
      const cipher = createCipheriv("aes-256-gcm", key, iv);
      const enc = Buffer.concat([cipher.update(JSON.stringify(payload), "utf8"), cipher.final()]);
      return b64(Buffer.concat([iv, cipher.getAuthTag(), enc]));
    },
    open(token) {
      if (typeof token !== "string" || token.length < 40) return null;
      try {
        const raw = Buffer.from(token, "base64url");
        const decipher = createDecipheriv("aes-256-gcm", key, raw.subarray(0, 12));
        decipher.setAuthTag(raw.subarray(12, 28));
        const text = Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]).toString("utf8");
        return JSON.parse(text);
      } catch {
        return null;
      }
    },
  };
}

/**
 * @param secret     MCP_AUTH_TOKEN (deriva las claves)
 * @param publicUrl  URL pública https del servidor MCP
 * @param login      async ({ email, password, totp }) => sesión { token, user, permissions, exp }; lanza RelojError
 */
export function createOAuth({ secret, publicUrl, login }) {
  const hmacKey = createHmac("sha256", secret).update("reloj-mcp-oauth-v2").digest();
  const sealer = createSealer(secret);
  const base = publicUrl.replace(/\/$/, "");
  const usedCodes = new Map(); // código → exp (un solo uso; se pierde al reiniciar, vida corta)
  const attempts = new Map(); // ip → { n, reset }

  const sign = (payload) => {
    const body = b64(JSON.stringify(payload));
    return `${body}.${createHmac("sha256", hmacKey).update(body).digest("base64url")}`;
  };
  const verify = (token, type) => {
    if (typeof token !== "string") return null;
    const [body, mac] = token.split(".");
    if (!body || !mac || !eq(mac, createHmac("sha256", hmacKey).update(body).digest("base64url"))) return null;
    try {
      const p = JSON.parse(Buffer.from(body, "base64url").toString());
      return p.t === type && p.exp > Date.now() / 1000 ? p : null;
    } catch {
      return null;
    }
  };
  const open = (token, type) => {
    const p = sealer.open(token);
    return p && p.t === type && p.exp > Date.now() / 1000 ? p : null;
  };
  const now = () => Math.floor(Date.now() / 1000);

  const send = (res, status, body, headers = {}) => {
    const isJson = typeof body === "object";
    res.writeHead(status, {
      "Content-Type": isJson ? "application/json" : "text/html; charset=utf-8",
      "Cache-Control": "no-store",
      "Access-Control-Allow-Origin": "*",
      ...headers,
    });
    res.end(isJson ? JSON.stringify(body) : body);
  };
  const oauthError = (res, status, error, description) => send(res, status, { error, error_description: description });

  async function readBody(req) {
    let raw = "";
    for await (const chunk of req) {
      raw += chunk;
      if (raw.length > 100_000) throw new Error("body too large");
    }
    const type = req.headers["content-type"] || "";
    if (type.includes("application/json")) return raw ? JSON.parse(raw) : {};
    return Object.fromEntries(new URLSearchParams(raw));
  }

  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

  function loginPage(q, error, { totp = false } = {}) {
    const hidden = ["client_id", "redirect_uri", "state", "code_challenge", "code_challenge_method", "response_type", "resource", "scope"]
      .map((k) => `<input type="hidden" name="${k}" value="${esc(q[k])}">`)
      .join("");
    return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Autorizar Reloj CR</title><style>body{font:16px system-ui;max-width:400px;margin:8vh auto;padding:0 16px;line-height:1.45}
input[type=email],input[type=password],input[type=text]{width:100%;padding:10px;margin:6px 0 14px;box-sizing:border-box}button{padding:10px 16px;width:100%}
.e{color:#b00020}.s{font-size:13.5px;color:#555}</style></head>
<body><h1>Reloj CR</h1>
<p><strong>${esc(q.client_name || "Un cliente MCP")}</strong> pide actuar en Reloj CR <strong>como usted</strong>.</p>
<p class="s">Podrá consultar asistencia y, según su rol, programar turnos, enviar o aprobar cronogramas, registrar novedades y autorizar accesos y movilidad.
Todo queda registrado a su nombre y no puede hacer más de lo que usted puede hacer. La sesión dura hasta 12 horas.</p>
${error ? `<p class="e">${esc(error)}</p>` : ""}
<form method="post" action="/authorize">${hidden}
<label>Correo<input type="email" name="email" value="${esc(q.email)}" autocomplete="username" autofocus required></label>
<label>Contraseña de Reloj CR<input type="password" name="password" autocomplete="current-password" required></label>
${totp ? `<label>Código de verificación (TOTP)<input type="text" name="totp" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]{6}" required></label>` : ""}
<button type="submit">Autorizar</button></form></body></html>`;
  }

  function validateAuthorize(q) {
    const client = verify(q.client_id, "client");
    if (!client) return "client_id inválido";
    if (!client.r.includes(q.redirect_uri)) return "redirect_uri no registrada";
    return null;
  }

  function throttled(ip) {
    const e = attempts.get(ip);
    if (!e || e.reset < Date.now()) return false;
    return e.n >= 5;
  }
  function failed(ip) {
    const e = attempts.get(ip);
    if (!e || e.reset < Date.now()) attempts.set(ip, { n: 1, reset: Date.now() + 15 * 60_000 });
    else e.n++;
  }

  const cors = {
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Authorization, Content-Type, MCP-Protocol-Version, Mcp-Session-Id",
    "Access-Control-Expose-Headers": "WWW-Authenticate",
  };

  return {
    /** Sesión de Reloj guardada en un access token emitido por este servidor (o null). */
    resolveAccessToken: (token) => open(token, "at")?.s ?? null,
    challenge: `Bearer resource_metadata="${base}/.well-known/oauth-protected-resource"`,

    /** Atiende rutas OAuth. Devuelve true si la petición fue manejada. */
    async handle(req, res, pathname) {
      const method = req.method;
      if (method === "OPTIONS" && (pathname.startsWith("/.well-known/") || ["/register", "/token", "/mcp"].includes(pathname))) {
        send(res, 204, "", cors);
        return true;
      }

      if (pathname.startsWith("/.well-known/oauth-protected-resource")) {
        send(res, 200, { resource: `${base}/mcp`, authorization_servers: [base], bearer_methods_supported: ["header"] });
        return true;
      }
      if (pathname.startsWith("/.well-known/oauth-authorization-server") || pathname.startsWith("/.well-known/openid-configuration")) {
        send(res, 200, {
          issuer: base,
          authorization_endpoint: `${base}/authorize`,
          token_endpoint: `${base}/token`,
          registration_endpoint: `${base}/register`,
          response_types_supported: ["code"],
          grant_types_supported: ["authorization_code"],
          code_challenge_methods_supported: ["S256"],
          token_endpoint_auth_methods_supported: ["none"],
        });
        return true;
      }

      if (pathname === "/register" && method === "POST") {
        let meta;
        try {
          meta = await readBody(req);
        } catch {
          oauthError(res, 400, "invalid_client_metadata", "cuerpo inválido");
          return true;
        }
        const uris = meta.redirect_uris;
        if (!Array.isArray(uris) || !uris.length || uris.length > 10 || !uris.every((u) => typeof u === "string" && /^https?:\/\//.test(u))) {
          oauthError(res, 400, "invalid_redirect_uri", "redirect_uris requerido (http/https)");
          return true;
        }
        const name = String(meta.client_name || "MCP client").slice(0, 80);
        send(res, 201, {
          client_id: sign({ t: "client", r: uris, n: name, exp: now() + 365 * 86400 }),
          client_name: name,
          redirect_uris: uris,
          token_endpoint_auth_method: "none",
          grant_types: ["authorization_code"],
          response_types: ["code"],
        });
        return true;
      }

      if (pathname === "/authorize") {
        if (method === "GET") {
          const q = Object.fromEntries(new URL(req.url, base).searchParams);
          const err = validateAuthorize(q);
          if (err) send(res, 400, `<p>${esc(err)}</p>`);
          else if (q.response_type !== "code" || q.code_challenge_method !== "S256" || !q.code_challenge) send(res, 400, "<p>Se requiere response_type=code y PKCE S256</p>");
          else send(res, 200, loginPage({ ...q, client_name: verify(q.client_id, "client").n }));
          return true;
        }
        if (method === "POST") {
          let q;
          try {
            q = await readBody(req);
          } catch {
            send(res, 400, "<p>Petición inválida</p>");
            return true;
          }
          const err = validateAuthorize(q);
          if (err || q.code_challenge_method !== "S256" || !q.code_challenge) {
            send(res, 400, `<p>${esc(err || "PKCE S256 requerido")}</p>`);
            return true;
          }
          const ip = req.headers["x-forwarded-for"]?.split(",")[0].trim() || req.socket.remoteAddress || "?";
          const page = { ...q, client_name: verify(q.client_id, "client").n };
          if (throttled(ip)) {
            send(res, 429, loginPage(page, "Demasiados intentos. Espere 15 minutos."));
            return true;
          }
          let session;
          try {
            session = await login({ email: String(q.email ?? "").trim().toLowerCase(), password: String(q.password ?? ""), totp: q.totp ? String(q.totp).trim() : undefined });
          } catch (e) {
            if (e?.code === "TOTP_REQUIRED") {
              send(res, 401, loginPage(page, "Esta cuenta usa verificación en dos pasos: escriba el código.", { totp: true }));
              return true;
            }
            failed(ip);
            const msg =
              e?.status === 429
                ? "Reloj CR pide esperar un minuto antes de reintentar."
                : e?.code === "INVALID_TOTP"
                  ? "Código de verificación incorrecto."
                  : e?.status === 401
                    ? "Correo o contraseña incorrectos."
                    : "No se pudo iniciar sesión en Reloj CR. Intente de nuevo.";
            send(res, e?.status === 429 ? 429 : 401, loginPage(page, msg, { totp: e?.code === "INVALID_TOTP" }));
            return true;
          }
          const code = sealer.seal({
            t: "code",
            c: q.client_id,
            ru: q.redirect_uri,
            cc: q.code_challenge,
            n: randomBytes(8).toString("hex"),
            exp: now() + 300,
            s: session,
          });
          const target = new URL(q.redirect_uri);
          target.searchParams.set("code", code);
          if (q.state) target.searchParams.set("state", q.state);
          res.writeHead(302, { Location: target.toString(), "Cache-Control": "no-store" }).end();
          return true;
        }
      }

      if (pathname === "/token" && method === "POST") {
        let b;
        try {
          b = await readBody(req);
        } catch {
          oauthError(res, 400, "invalid_request", "cuerpo inválido");
          return true;
        }
        if (b.grant_type !== "authorization_code") {
          oauthError(res, 400, "unsupported_grant_type", "Solo authorization_code: la sesión dura 12 h; después, autorice de nuevo.");
          return true;
        }
        const code = open(b.code, "code");
        if (!code || code.c !== b.client_id || code.ru !== b.redirect_uri) {
          oauthError(res, 400, "invalid_grant", "código inválido o vencido");
          return true;
        }
        const challenge = createHash("sha256").update(String(b.code_verifier ?? "")).digest("base64url");
        if (!b.code_verifier || !eq(challenge, code.cc)) {
          oauthError(res, 400, "invalid_grant", "PKCE no coincide");
          return true;
        }
        for (const [k, exp] of usedCodes) if (exp < now()) usedCodes.delete(k);
        if (usedCodes.has(code.n)) {
          oauthError(res, 400, "invalid_grant", "código ya usado");
          return true;
        }
        usedCodes.set(code.n, code.exp);
        const exp = Math.min(code.s.exp, now() + 12 * 3600) - 60;
        if (exp <= now()) {
          oauthError(res, 400, "invalid_grant", "la sesión de Reloj ya venció");
          return true;
        }
        send(res, 200, {
          access_token: sealer.seal({ t: "at", exp, s: code.s }),
          token_type: "Bearer",
          expires_in: exp - now(),
        });
        return true;
      }
      return false;
    },
  };
}
