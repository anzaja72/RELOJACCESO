import { NextResponse } from "next/server";

export const runtimeHint = {
  runtime: "nodejs" as const,
};

export function json(data: unknown, status = 200) {
  return NextResponse.json(data, { status });
}

export function badRequest(message: string, extra?: Record<string, unknown>) {
  return json({ error: message, ...extra }, 400);
}

export function serverError(error: unknown) {
  const message = error instanceof Error ? error.message : "Error interno";
  return json({ error: message }, 500);
}

export function parseJson<T>(request: Request): Promise<T> {
  return request.json() as Promise<T>;
}
