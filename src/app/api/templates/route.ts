import { isKioskDenied, kioskSite, requireKiosk } from "@/lib/auth";
import { listEmployees, listTemplates } from "@/lib/db";
import { json } from "@/lib/http";

export const runtime = "nodejs";

export function GET(request: Request) {
  const caller = requireKiosk(request);
  if (isKioskDenied(caller)) return caller;
  const site = kioskSite(caller, new URL(request.url).searchParams.get("site"));
  return json({
    employees: listEmployees(site),
    templates: listTemplates(site),
  });
}
