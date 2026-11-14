import { activateTerminal, getDb, listSites, TerminalUnavailableError } from "@/lib/db";
import { badRequest, json, parseJson, rateLimit, serverError } from "@/lib/http";
import { signTerminalToken, TERMINAL_TOKEN_HOURS, verifyPassword } from "@/lib/session";

export const runtime = "nodejs";

const norm = (s: unknown) =>
  String(s ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
    .toLowerCase();

/**
 * Activa este equipo como una de las tablets que el superadmin creó para la tienda, con el usuario de KIOSCO
 * de esa tienda: { tienda, password, terminalId? }. Nunca crea tablets (ver activateTerminal).
 * «tienda» es el código (AP) o el nombre exacto (Alto Prado). Devuelve un token de terminal, que solo sirve
 * para marcar en esa tienda. El usuario kiosco nunca recibe sesión: no puede consultar ni cambiar nada más.
 */
export async function POST(request: Request) {
  const limited = rateLimit(request, 10);
  if (limited) return limited;
  try {
    const body = await parseJson<{ tienda?: string; password?: string; label?: string; terminalId?: string }>(request);
    if (!body.tienda || !body.password) return badRequest("Tienda y contraseña son obligatorias", { code: "VALIDATION" }, request);
    const wanted = norm(body.tienda);
    const site = listSites().find((s) => norm(s.code) === wanted || norm(s.name) === wanted);
    const users = site
      ? (getDb()
          .prepare("SELECT email, password_hash FROM users WHERE role = 'kiosk' AND active = 1 AND scope_type = 'site' AND scope_id = ?")
          .all(site.id) as Array<{ email: string; password_hash: string }>)
      : [];
    const user = users.find((u) => verifyPassword(String(body.password), u.password_hash));
    // Mismo mensaje si la tienda no existe, no tiene kiosco o la contraseña no coincide.
    if (!site || !user) return json({ error: "Tienda o contraseña incorrectas", code: "INVALID_CREDENTIALS" }, 401, request);
    const terminal = activateTerminal({
      siteId: site.id,
      label: body.label?.slice(0, 60),
      userAgent: request.headers.get("user-agent") || "unknown",
      activatedBy: user.email,
      previousId: typeof body.terminalId === "string" ? body.terminalId.slice(0, 64) : undefined,
    });
    const token = signTerminalToken({ terminalId: terminal.terminalId, siteId: terminal.site.id, tokenId: terminal.tokenId });
    return json({ token, terminalId: terminal.terminalId, site: terminal.site, expiresHours: TERMINAL_TOKEN_HOURS }, 201, request);
  } catch (error) {
    // Contraseña correcta, pero la tienda no tiene una tablet libre: solo el superadmin agrega tablets.
    if (error instanceof TerminalUnavailableError) return json({ error: error.message, code: error.code }, 409, request);
    return serverError(error, request);
  }
}
