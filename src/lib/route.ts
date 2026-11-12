import { NextResponse } from "next/server";
import { isResponse, requireActor, type Actor } from "@/lib/auth";
import { json, serverError } from "@/lib/http";
import { DomainError } from "@/lib/stores";

/** Autentica, ejecuta y traduce DomainError a 400/403/404/409. */
export async function withActor(
  request: Request,
  fn: (actor: Actor) => unknown | Promise<unknown>,
  status = 200,
): Promise<Response> {
  const actor = requireActor(request);
  if (isResponse(actor)) return actor;
  try {
    const data = await fn(actor);
    return data instanceof NextResponse || data instanceof Response ? data : json(data, status, request);
  } catch (error) {
    if (error instanceof DomainError) return json({ error: error.message, code: error.code }, error.status, request);
    if (error instanceof SyntaxError) return json({ error: "JSON inválido", code: "VALIDATION" }, 400, request);
    return serverError(error, request);
  }
}

export function query(request: Request) {
  const params = new URL(request.url).searchParams;
  return (key: string) => params.get(key) || undefined;
}
