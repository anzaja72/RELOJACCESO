import { requireAdmin } from "@/lib/auth";
import { listEvents } from "@/lib/db";
import { json } from "@/lib/http";

export const runtime = "nodejs";

export function GET(request: Request) {
  const denied = requireAdmin(request);
  if (denied) return denied;
  const events = listEvents(80).map((event) => ({
    ...event,
    payload: JSON.parse(event.payload),
  }));
  return json({
    events,
    note: "En producción estos eventos alimentarían webhooks HMAC. En el DEMO solo se registran en SQLite.",
  });
}
