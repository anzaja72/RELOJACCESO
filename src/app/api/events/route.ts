import { isResponse } from "@/lib/auth";
import { allowedSiteIds, requireReader } from "@/lib/scope";
import { listEvents } from "@/lib/db";
import { json } from "@/lib/http";

export const runtime = "nodejs";

export function GET(request: Request) {
  const actor = requireReader(request);
  if (isResponse(actor)) return actor;
  // Quien no ve todas las sedes solo ve los eventos de las suyas (los globales quedan fuera).
  const allowed = allowedSiteIds(actor);
  const events = listEvents(80)
    .map((event) => ({
      ...event,
      payload: JSON.parse(event.payload) as { siteId?: string },
    }))
    .filter((event) => !allowed || allowed.includes(String(event.payload?.siteId)));
  return json({
    events,
    note: "En producción estos eventos alimentarían webhooks HMAC. En el DEMO solo se registran en SQLite.",
  });
}
