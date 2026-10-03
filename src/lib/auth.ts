import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { getSiteByCode, terminalTokenActive } from "@/lib/db";
import { siteIdsForScope } from "@/lib/db-ops";
import { json } from "@/lib/http";
import { integrationApiKey } from "@/lib/secrets";
import {
  canApprove,
  canWrite,
  verifyTerminalToken,
  verifyToken,
  type Role,
  type SessionUser,
  type TerminalSession,
} from "@/lib/session";

export type Actor = SessionUser & { via: "jwt" | "api_key" };

const API_ACTOR: Actor = {
  id: "api_key",
  email: "api@reloj.cr",
  name: "Clave API",
  role: "superadmin",
  scopeType: "all",
  scopeId: null,
  via: "api_key",
};

export function readApiKey(request: Request): string | null {
  const header = request.headers.get("x-api-key");
  if (header) return header.trim();
  const auth = request.headers.get("authorization");
  if (auth?.toLowerCase().startsWith("bearer ")) {
    return auth.slice(7).trim();
  }
  return null;
}

function sameSecret(a: string, b: string) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

export function readActor(request: Request): Actor | null {
  const key = readApiKey(request);
  if (!key) return null;
  const apiKey = integrationApiKey();
  if (apiKey && sameSecret(key, apiKey)) return API_ACTOR;
  const session = verifyToken(key);
  if (!session) return null;
  return { ...session, via: "jwt" };
}

export function requireAdmin(request: Request): NextResponse | null {
  if (readActor(request)) return null;
  return json(
    {
      error: "No autorizado",
      code: "AUTH_REQUIRED",
      hint: "Envíe X-API-Key, Authorization: Bearer <api-key> o un JWT de /api/v1/auth/login",
    },
    401,
    request,
  );
}

export function requireActor(request: Request): Actor | NextResponse {
  const actor = readActor(request);
  if (!actor) {
    return json(
      { error: "No autorizado", code: "AUTH_REQUIRED" },
      401,
      request,
    );
  }
  return actor;
}

export function requireWrite(request: Request): Actor | NextResponse {
  const actor = requireActor(request);
  if (actor instanceof NextResponse) return actor;
  if (!canWrite(actor.role)) {
    return json({ error: "Permiso insuficiente", code: "FORBIDDEN" }, 403, request);
  }
  return actor;
}

export function requireApprover(request: Request): Actor | NextResponse {
  const actor = requireActor(request);
  if (actor instanceof NextResponse) return actor;
  if (!canApprove(actor.role)) {
    return json({ error: "Se requiere gerente de sede o superior", code: "FORBIDDEN" }, 403, request);
  }
  return actor;
}

export function isResponse(value: unknown): value is NextResponse {
  return value instanceof NextResponse;
}

export function roleOf(actor: Actor): Role {
  return actor.role;
}

/**
 * Quién puede marcar: una terminal activada (token de kiosco, atado a una sede)
 * o un usuario con permiso de escritura probando el kiosco.
 */
export type KioskCaller =
  | ({ kind: "terminal" } & TerminalSession)
  | { kind: "user"; actor: Actor };

export function requireKiosk(request: Request): KioskCaller | NextResponse {
  const key = readApiKey(request);
  const terminal = key ? verifyTerminalToken(key) : null;
  if (terminal) {
    if (!terminalTokenActive(terminal.terminalId, terminal.tokenId)) {
      return json(
        { error: "Terminal revocada o reemplazada. Actívela de nuevo.", code: "TERMINAL_REVOKED" },
        401,
        request,
      );
    }
    return { kind: "terminal", ...terminal };
  }
  const actor = requireWrite(request);
  if (actor instanceof NextResponse) return actor;
  return { kind: "user", actor };
}

export function isKioskDenied(value: KioskCaller | NextResponse): value is NextResponse {
  return value instanceof NextResponse;
}

/** Una terminal solo marca en su sede; un usuario puede elegir la sede. */
export function kioskSite(caller: KioskCaller, requested?: string | null) {
  if (caller.kind === "terminal") return caller.siteId;
  if (!requested) return undefined;
  return getSiteByCode(requested)?.id ?? requested;
}

/**
 * Sede efectiva de una llamada de kiosco, ya validada contra el alcance.
 * Una terminal queda atada a su sede; un usuario con alcance limitado solo puede
 * elegir sedes dentro de su alcance (o su única sede si no indica ninguna).
 * `site` undefined solo ocurre para quien ve todo y no pidió una sede.
 */
export function resolveKioskSite(
  request: Request,
  caller: KioskCaller,
  requested?: string | null,
): { site: string | undefined } | NextResponse {
  if (caller.kind === "terminal") return { site: caller.siteId };
  const resolved = requested ? (getSiteByCode(requested)?.id ?? requested) : undefined;
  const allowed = siteIdsForScope({
    role: caller.actor.role,
    scopeType: caller.actor.scopeType,
    scopeId: caller.actor.scopeId,
  });
  if (!allowed) return { site: resolved };
  const site = resolved ?? (allowed.length === 1 ? allowed[0] : undefined);
  if (!site || !allowed.includes(site)) {
    return json({ error: "Sede fuera de su alcance", code: "FORBIDDEN" }, 403, request);
  }
  return { site };
}

export function kioskTerminalId(caller: KioskCaller, requested?: string | null) {
  return caller.kind === "terminal" ? caller.terminalId : requested || "";
}
