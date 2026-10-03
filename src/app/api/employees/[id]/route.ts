import { getEmployee, patchEmployee } from "@/lib/db";
import { json, parseJson, serverError } from "@/lib/http";
import { requireEmployeeAccess, siteInScope } from "@/lib/scope";

export const runtime = "nodejs";

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const access = requireEmployeeAccess(request, id, { write: false });
  if (access instanceof Response) return access;
  return json({ employee: access.employee });
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const access = requireEmployeeAccess(request, id, { write: true });
  if (access instanceof Response) return access;
  try {
    const body = await parseJson<{
      active?: boolean;
      revokeConsent?: boolean;
      name?: string;
      code?: string;
      siteId?: string;
      deleted?: boolean;
      pin?: string | null;
      role?: string;
    }>(request);
    // Un traslado también debe terminar en una sede de su alcance.
    if (body.siteId && !siteInScope(access.actor, body.siteId)) {
      return json({ error: "Sede fuera de su alcance", code: "FORBIDDEN" }, 403);
    }
    const employee = patchEmployee(access.employee.id, body);
    return json({ employee: getEmployee(employee.id) ?? employee });
  } catch (error) {
    return serverError(error);
  }
}
