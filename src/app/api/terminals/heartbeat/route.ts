import { isKioskDenied, isResponse, kioskTerminalId, requireKiosk, resolveKioskSite } from "@/lib/auth";
import { heartbeat } from "@/lib/db";
import { badRequest, json, parseJson, serverError } from "@/lib/http";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const caller = requireKiosk(request);
  if (isKioskDenied(caller)) return caller;
  try {
    const body = await parseJson<{
      id?: string;
      siteId?: string;
      label?: string;
      userAgent?: string;
      path?: string;
    }>(request);
    body.id = kioskTerminalId(caller, body.id);
    const resolvedSite = resolveKioskSite(request, caller, body.siteId);
    if (isResponse(resolvedSite)) return resolvedSite;
    body.siteId = resolvedSite.site;
    if (!body.id || !body.siteId) {
      return badRequest("id y siteId son obligatorios");
    }
    heartbeat({
      id: body.id,
      siteId: body.siteId,
      label: body.label,
      userAgent: body.userAgent || "unknown",
      path: body.path || "/kiosk",
    });
    return json({ ok: true });
  } catch (error) {
    return serverError(error);
  }
}
