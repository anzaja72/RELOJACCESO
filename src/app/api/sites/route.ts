import { readActor } from "@/lib/auth";
import { listSites } from "@/lib/db";
import { listSitesScoped } from "@/lib/db-ops";
import { json } from "@/lib/http";

export const runtime = "nodejs";

// Sin sesión devuelve todas (la tablet las necesita para activarse); con sesión, solo las de su alcance.
export function GET(request: Request) {
  const actor = readActor(request);
  const sites = actor
    ? listSitesScoped({ role: actor.role, scopeType: actor.scopeType, scopeId: actor.scopeId })
    : listSites();
  return json({ sites });
}
