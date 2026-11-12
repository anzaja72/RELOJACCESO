import { parseJson } from "@/lib/http";
import { withActor } from "@/lib/route";
import { createMobility, listAccess, MOBILITY_REASONS } from "@/lib/stores";

export const runtime = "nodejs";

export function GET(request: Request) {
  return withActor(request, (actor) => ({
    mobility: listAccess(actor, { includeRevoked: true }).filter((r) => r.kind === "movilidad"),
    reasons: MOBILITY_REASONS,
  }));
}

/** { employeeId, toSiteId, startDate, endDate, reason, note? } */
export function POST(request: Request) {
  return withActor(request, async (actor) => ({
    mobility: createMobility(await parseJson(request), actor),
  }), 201);
}
