import { getDb, listTerminals, statsToday } from "@/lib/db";
import { json } from "@/lib/http";
import { APP } from "@/lib/config";

export const runtime = "nodejs";

export function GET() {
  getDb();
  return json({
    ok: true,
    demo: true,
    app: APP.name,
    rfp: APP.rfp,
    time: new Date().toISOString(),
    timezone: "America/Costa_Rica",
    terminals: listTerminals(),
    today: statsToday(),
  });
}
