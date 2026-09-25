import { requireActor, requireAdmin } from "@/lib/auth";
import { createEmployee, listEmployees } from "@/lib/db";
import { badRequest, json, parseJson, serverError } from "@/lib/http";

export const runtime = "nodejs";

export function GET(request: Request) {
  const actor = requireActor(request);
  if (actor instanceof Response) return actor;
  const site = new URL(request.url).searchParams.get("site") ?? undefined;
  return json({ employees: listEmployees(site) });
}

export async function POST(request: Request) {
  const denied = requireAdmin(request);
  if (denied) return denied;
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
