import { readActor } from "@/lib/auth";
import { getDb, listTerminals, statsToday } from "@/lib/db";
import { json } from "@/lib/http";
import { APP, TIMEZONE } from "@/lib/config";

export const runtime = "nodejs";

// Público para el health check de Render; el detalle operativo exige sesión.
export function GET(request: Request) {
  getDb();
  const base = {
    ok: true,
    edition: APP.edition,
    sandbox: process.env.SANDBOX === "true",
    app: APP.name,
    rfp: APP.rfp,
    time: new Date().toISOString(),
    timezone: TIMEZONE,
  };
  if (!readActor(request)) return json(base);
  return json({ ...base, terminals: listTerminals(), today: statsToday() });
}
