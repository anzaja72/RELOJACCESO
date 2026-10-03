import { requireEmployeeAccess } from "@/lib/scope";
import {
  addTemplates,
  getEmployee,
  setEmployeeConsent,
  wipeTemplates,
} from "@/lib/db";
import { badRequest, json, parseJson, serverError } from "@/lib/http";

export const runtime = "nodejs";

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  // Antes no pedía sesión y devolvía los descriptores faciales de cualquier empleado.
  // Los descriptores solo viajan hacia el kiosco por /api/templates; aquí basta el resumen.
  const { id } = await context.params;
  const access = requireEmployeeAccess(request, id, { write: false });
  if (access instanceof Response) return access;
  return json({ employee: access.employee });
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  // Capturar biometría exige permiso de escritura (no el auditor) y la sede del empleado.
  const { id } = await context.params;
  const access = requireEmployeeAccess(request, id, { write: true });
  if (access instanceof Response) return access;
  const { employee, actor } = access;
  try {
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
    addTemplates(employee.id, descriptors.slice(0, 3), {
      operatorId: actor.id,
      operatorName: actor.name ?? actor.email,
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
  const { id } = await context.params;
  const access = requireEmployeeAccess(request, id, { write: true });
  if (access instanceof Response) return access;
  const { employee, actor } = access;
  wipeTemplates(employee.id, {
    operatorId: actor.id,
    operatorName: actor.name ?? actor.email,
    userAgent: request.headers.get("user-agent"),
  });
  return json({ ok: true, employee: getEmployee(employee.id) });
}
