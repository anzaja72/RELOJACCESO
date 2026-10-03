import { isKioskDenied, isResponse, requireKiosk, resolveKioskSite } from "@/lib/auth";
import { listEmployees, listTemplates } from "@/lib/db";
import { json } from "@/lib/http";

export const runtime = "nodejs";

export function GET(request: Request) {
  const caller = requireKiosk(request);
  if (isKioskDenied(caller)) return caller;
  const resolved = resolveKioskSite(request, caller, new URL(request.url).searchParams.get("site"));
  if (isResponse(resolved)) return resolved;
  // Solo empleados activos: un colaborador dado de baja no se distribuye a los kioscos.
  const employees = listEmployees(resolved.site).filter((e) => e.active);
  const ids = new Set(employees.map((e) => e.id));
  return json({
    employees,
    templates: listTemplates(resolved.site).filter((t) => ids.has(t.employeeId)),
  });
}
