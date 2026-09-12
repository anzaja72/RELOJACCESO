import { NextResponse } from "next/server";
import { DEMO_API_KEY } from "@/lib/config";
import { json } from "@/lib/http";
import { canApprove, canWrite, verifyToken, type Role, type SessionUser } from "@/lib/session";

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

export function readActor(request: Request): Actor | null {
  const key = readApiKey(request);
  if (!key) return null;
  if (key === DEMO_API_KEY) return API_ACTOR;
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

export function isResponse(value: Actor | NextResponse): value is NextResponse {
  return value instanceof NextResponse;
}

export function roleOf(actor: Actor): Role {
  return actor.role;
}
