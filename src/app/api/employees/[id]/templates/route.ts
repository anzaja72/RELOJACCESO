import { readActor, requireAdmin } from "@/lib/auth";
import {
  addTemplates,
  getEmployee,
  listTemplates,
  setEmployeeConsent,
  wipeTemplates,
} from "@/lib/db";
import { badRequest, json, parseJson, serverError } from "@/lib/http";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const employee = getEmployee(id);
  if (!employee) return json({ error: "No encontrado" }, 404);
  const templates = listTemplates().filter((t) => t.employeeId === employee.id);
  return json({ employee, templates });
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const denied = requireAdmin(request);
  if (denied) return denied;
  try {
    const { id } = await context.params;
    const employee = getEmployee(id);
    if (!employee) return json({ error: "No encontrado" }, 404);
    const body = await parseJson<{
      descriptors?: number[][];
      consentAt?: string;
    }>(request);
    const descriptors = (body.descriptors ?? []).filter(
      (d) => Array.isArray(d) && d.length === 128,
    );
    if (descriptors.length === 0) {
      return badRequest("Se requieren 1–3 descriptores de 128 dimensiones");
    }
    if (body.consentAt) setEmployeeConsent(employee.id, body.consentAt);
    const actor = readActor(request);
    addTemplates(employee.id, descriptors.slice(0, 3), {
      operatorId: actor?.id,
      operatorName: actor?.name ?? actor?.email,
      userAgent: request.headers.get("user-agent"),
      siteId: employee.siteId,
    });
    return json({ ok: true, employee: getEmployee(employee.id) }, 201);
  } catch (error) {
    return serverError(error);
  }
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const denied = requireAdmin(request);
  if (denied) return denied;
  const { id } = await context.params;
  const employee = getEmployee(id);
  if (!employee) return json({ error: "No encontrado" }, 404);
  const actor = readActor(request);
  wipeTemplates(employee.id, {
    operatorId: actor?.id,
    operatorName: actor?.name ?? actor?.email,
    userAgent: request.headers.get("user-agent"),
  });
  return json({ ok: true, employee: getEmployee(employee.id) });
}
