import { parseJson } from "@/lib/http";
import { query, withActor } from "@/lib/route";
import { listAccess, setStoreAccess } from "@/lib/stores";

export const runtime = "nodejs";

export function GET(request: Request) {
  const q = query(request);
  return withActor(request, (actor) => ({
    access: listAccess(actor, { employeeId: q("employee"), includeRevoked: q("history") === "1" }),
  }));
}

/** Casilla empleado × tienda: { employeeId, siteId, enabled, endDate?, reason? }. */
export function POST(request: Request) {
  return withActor(request, async (actor) => ({
    access: setStoreAccess(await parseJson(request), actor),
  }));
}
