import { isKioskDenied, isResponse, requireKiosk, resolveKioskSite } from "@/lib/auth";
import { MATCH_THRESHOLD } from "@/lib/config";
import { getEmployee, listEmployees, listTemplates } from "@/lib/db";
import { identifyFace } from "@/lib/match";
import { badRequest, json, parseJson, rateLimit } from "@/lib/http";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const limited = rateLimit(request);
  if (limited) return limited;
  const caller = requireKiosk(request);
  if (isKioskDenied(caller)) return caller;
  const body = await parseJson<{
    descriptor?: number[];
    siteId?: string;
    threshold?: number;
  }>(request);
  if (!body.descriptor || body.descriptor.length !== 128) {
    return badRequest("descriptor de 128 dimensiones es obligatorio");
  }
  const resolved = resolveKioskSite(request, caller, body.siteId);
  if (isResponse(resolved)) return resolved;
  const siteId = resolved.site;
  const employees = listEmployees(siteId).filter((e) => e.active);
  const templates = listTemplates(siteId);
  const gallery = employees.map((employee) => ({
    employee,
    descriptors: templates
      .filter((t) => t.employeeId === employee.id)
      .map((t) => t.descriptor),
  }));
  const result = identifyFace(
    body.descriptor,
    gallery,
    body.threshold ?? MATCH_THRESHOLD,
  );
  return json({
    ...result,
    employee: result.employee ? getEmployee(result.employee.id) : null,
  });
}
