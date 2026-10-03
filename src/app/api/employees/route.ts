import { requireActor, requireWrite } from "@/lib/auth";
import { filterBySite, siteInScope } from "@/lib/scope";
import { createEmployee, listEmployees } from "@/lib/db";
import { badRequest, json, parseJson, serverError } from "@/lib/http";

export const runtime = "nodejs";

export function GET(request: Request) {
  const actor = requireActor(request);
  if (actor instanceof Response) return actor;
  const site = new URL(request.url).searchParams.get("site") ?? undefined;
  return json({ employees: filterBySite(actor, listEmployees(site), (e) => e.siteId) });
}

export async function POST(request: Request) {
  const actor = requireWrite(request);
  if (actor instanceof Response) return actor;
  try {
    const body = await parseJson<{
      name?: string;
      code?: string;
      siteId?: string;
      role?: string;
      consentAt?: string | null;
    }>(request);
    if (!body.name?.trim() || !body.code?.trim() || !body.siteId) {
      return badRequest("name, code y siteId son obligatorios");
    }
    if (!siteInScope(actor, body.siteId)) {
      return json({ error: "Sede fuera de su alcance", code: "FORBIDDEN" }, 403);
    }
    const employee = createEmployee({
      name: body.name,
      code: body.code,
      siteId: body.siteId,
      role: body.role,
      consentAt: body.consentAt,
    });
    return json({ employee }, 201);
  } catch (error) {
    return serverError(error);
  }
}
