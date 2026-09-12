import { NextResponse } from "next/server";

export function requestId(request?: Request) {
  return request?.headers.get("x-request-id") || crypto.randomUUID();
}

export function json(data: unknown, status = 200, request?: Request) {
  const id = requestId(request);
  const res = NextResponse.json(data, { status });
  res.headers.set("X-Request-Id", id);
  return res;
}

export function badRequest(message: string, extra?: Record<string, unknown>, request?: Request) {
  return json({ error: message, ...extra }, 400, request);
}

export function serverError(error: unknown, request?: Request) {
  const message = error instanceof Error ? error.message : "Error interno";
  return json({ error: message }, 500, request);
}

export function parseJson<T>(request: Request): Promise<T> {
  return request.json() as Promise<T>;
}

const hits = new Map<string, number[]>();

export function rateLimit(request: Request, limit = 80, windowMs = 60_000) {
  const key =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "local";
  const now = Date.now();
  const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
  recent.push(now);
  hits.set(key, recent);
  if (recent.length > limit) {
    return json({ error: "Demasiadas solicitudes" }, 429, request);
  }
  return null;
}
