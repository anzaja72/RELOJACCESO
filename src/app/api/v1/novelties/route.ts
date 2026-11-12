import { parseJson } from "@/lib/http";
import { query, withActor } from "@/lib/route";
import { createNovelty, listNovelties, PROGRAMMED_TYPES, URGENT_TYPES } from "@/lib/stores";

export const runtime = "nodejs";

export function GET(request: Request) {
  const q = query(request);
  return withActor(request, (actor) => ({
    novelties: listNovelties(actor, {
      status: q("status"),
      kind: q("kind"),
      employeeId: q("employee"),
      siteId: q("site"),
      from: q("from"),
      to: q("to"),
    }),
    types: { programada: PROGRAMMED_TYPES, urgente: URGENT_TYPES },
  }));
}

export function POST(request: Request) {
  return withActor(request, async (actor) => ({
    novelty: createNovelty(await parseJson(request), actor),
  }), 201);
}
