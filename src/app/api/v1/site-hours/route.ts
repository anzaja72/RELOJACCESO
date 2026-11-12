import { parseJson } from "@/lib/http";
import { withActor } from "@/lib/route";
import { setSiteHours } from "@/lib/stores";

export const runtime = "nodejs";

/** Horario de apertura/cierre de una tienda (regional): { siteId, opensHm, closesHm }. */
export function PUT(request: Request) {
  return withActor(request, async (actor) => {
    const body = await parseJson<{ siteId?: string; opensHm?: string; closesHm?: string }>(request);
    return { site: setSiteHours(body.siteId ?? "", body.opensHm ?? "", body.closesHm ?? "", actor) };
  });
}
