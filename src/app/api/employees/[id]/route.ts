import { requireAdmin } from "@/lib/auth";
import { getEmployee, patchEmployee } from "@/lib/db";
import { json, parseJson, serverError } from "@/lib/http";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const employee = getEmployee(id);
  if (!employee) return json({ error: "No encontrado" }, 404);
  return json({ employee });
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const denied = requireAdmin(request);
  if (denied) return denied;
  try {
    const { id } = await context.params;
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
    const employee = patchEmployee(id, body);
    return json({ employee });
  } catch (error) {
    return serverError(error);
  }
}
