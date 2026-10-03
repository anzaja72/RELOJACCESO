import { requireActor } from "@/lib/auth";
import { filterBySite } from "@/lib/scope";
import { listTerminals } from "@/lib/db";
import { json } from "@/lib/http";

export const runtime = "nodejs";

export function GET(request: Request) {
  const actor = requireActor(request);
  if (actor instanceof Response) return actor;
  return json({ terminals: filterBySite(actor, listTerminals(), (t) => t.siteId) });
}
