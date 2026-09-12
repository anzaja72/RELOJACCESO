import { MATCH_THRESHOLD } from "@/lib/config";
import { getEmployee, listEmployees, listTemplates } from "@/lib/db";
import { identifyFace } from "@/lib/match";
import { badRequest, json, parseJson, rateLimit } from "@/lib/http";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const limited = rateLimit(request);
  if (limited) return limited;
  const body = await parseJson<{
    descriptor?: number[];
    siteId?: string;
    threshold?: number;
  }>(request);
  if (!body.descriptor || body.descriptor.length !== 128) {
    return badRequest("descriptor de 128 dimensiones es obligatorio");
  }
  const employees = listEmployees(body.siteId).filter((e) => e.active);
  const templates = listTemplates(body.siteId);
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
