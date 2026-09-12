import { heartbeat } from "@/lib/db";
import { badRequest, json, parseJson, serverError } from "@/lib/http";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = await parseJson<{
      id?: string;
      siteId?: string;
      label?: string;
      userAgent?: string;
      path?: string;
    }>(request);
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
