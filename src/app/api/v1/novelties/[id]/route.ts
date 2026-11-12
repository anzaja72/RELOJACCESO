import { parseJson } from "@/lib/http";
import { withActor } from "@/lib/route";
import { decideNovelty, DomainError } from "@/lib/stores";

export const runtime = "nodejs";

/** Aprobar o rechazar una novedad pendiente: { decision: "aprobada"|"rechazada", comment }. */
export function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  return withActor(request, async (actor) => {
    const { id } = await context.params;
    const body = await parseJson<{ decision?: string; comment?: string }>(request);
    if (body.decision !== "aprobada" && body.decision !== "rechazada") {
      throw new DomainError("decision debe ser aprobada o rechazada");
    }
    return { novelty: decideNovelty(id, body.decision, body.comment, actor) };
  });
}
