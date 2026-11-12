import { mondayOf } from "@/lib/planning";
import { query, withActor } from "@/lib/route";
import { regionSummary } from "@/lib/stores";

export const runtime = "nodejs";

export function GET(request: Request) {
  const q = query(request);
  return withActor(request, (actor) => regionSummary(actor, q("week") ?? mondayOf(new Date().toISOString().slice(0, 10))));
}
