import { reviewAnomaly } from "@/lib/anomalies";
import { isResponse, requireWrite } from "@/lib/auth";
import { json, parseJson, serverError } from "@/lib/http";

export const runtime = "nodejs";

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const actor = requireWrite(request);
  if (isResponse(actor)) return actor;
  try {
    const { id } = await context.params;
    const body = await parseJson<{ reviewed?: boolean }>(request).catch(() => ({ reviewed: true }));
    if (body.reviewed === false) {
      return json({ error: "Solo se marca revisada", code: "VALIDATION" }, 400, request);
    }
    const row = reviewAnomaly(id, actor.email);
    if (!row) return json({ error: "No encontrada", code: "NOT_FOUND" }, 404, request);
    return json({ anomaly: row }, 200, request);
  } catch (error) {
    return serverError(error, request);
  }
}
