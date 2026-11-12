// Cliente de la API de Reloj CR (/api/v1) para el servidor MCP.
//
// Identidad: cada llamada va con la credencial del USUARIO que inició sesión (JWT), de modo que
// Reloj aplica sus permisos por rol, su alcance por tienda y deja el registro de auditoría a nombre
// de esa persona. La clave de integración (superadmin) solo se usa para herramientas de lectura.

export class RelojError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

/** Lee el vencimiento (segundos Unix) de un JWT de Reloj; el campo `exp` de Reloj va en milisegundos. */
export function jwtExpiry(token) {
  try {
    const payload = JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString());
    const ms = Number(payload.exp);
    return Number.isFinite(ms) ? Math.floor(ms / 1000) : 0;
  } catch {
    return 0;
  }
}

async function parse(res) {
  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }
  if (!res.ok) {
    const message = data?.error || text.slice(0, 300) || `HTTP ${res.status}`;
    throw new RelojError(res.status, data?.code || "ERROR", message);
  }
  return data;
}

/** Inicia sesión con correo y contraseña (y TOTP si el usuario lo tiene) y trae sus permisos. */
export async function loginReloj(base, { email, password, totp }) {
  const res = await fetch(`${base}/api/v1/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password, ...(totp ? { totp } : {}) }),
  });
  const data = await parse(res);
  const perms = await parse(
    await fetch(`${base}/api/v1/permissions`, { headers: { authorization: `Bearer ${data.token}` } }),
  );
  return { token: data.token, user: data.user, permissions: perms.permissions ?? [], exp: jwtExpiry(data.token) };
}

/**
 * @param base  URL de Reloj CR
 * @param auth  { kind: "user", token } | { kind: "key", key }
 * @param relogin  opcional: función que devuelve un JWT nuevo si Reloj responde 401 (solo stdio)
 */
export function createReloj({ base, auth, relogin }) {
  const root = base.replace(/\/$/, "");
  const state = { token: auth.kind === "user" ? auth.token : null };

  const headers = () => {
    if (auth.kind === "user") return { authorization: `Bearer ${state.token}` };
    return auth.key ? { "x-api-key": auth.key } : {};
  };

  async function call(method, path, { params, body } = {}, retried = false) {
    const url = new URL(`${root}/api/v1/${path}`);
    for (const [k, v] of Object.entries(params ?? {})) {
      if (v !== undefined && v !== null && v !== "") url.searchParams.set(k, String(v));
    }
    const res = await fetch(url, {
      method,
      headers: { ...headers(), ...(body !== undefined ? { "content-type": "application/json" } : {}) },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    if (res.status === 401 && relogin && !retried) {
      state.token = await relogin();
      return call(method, path, { params, body }, true);
    }
    return parse(res);
  }

  return {
    kind: auth.kind,
    get: (path, params) => call("GET", path, { params }),
    post: (path, body, params) => call("POST", path, { body, params }),
    put: (path, body) => call("PUT", path, { body }),
    patch: (path, body) => call("PATCH", path, { body }),
    del: (path) => call("DELETE", path),
  };
}
