import { parseJson } from "@/lib/http";
import { withActor } from "@/lib/route";
import { decidePlan, DomainError, savePlanCells, submitPlan, type CellInput } from "@/lib/stores";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

/** Guarda celdas: [{ employeeId, date, kind: turno|descanso|novedad|null, startHm, endHm, lunchMin, note }]. */
export function PUT(request: Request, context: Ctx) {
  return withActor(request, async (actor) => {
    const { id } = await context.params;
    const body = await parseJson<{ cells?: CellInput[] }>(request);
    if (!Array.isArray(body.cells)) throw new DomainError("cells[] es obligatorio");
    return savePlanCells(id, body.cells, actor);
  });
}

/** Acciones de flujo: submit (enviar al gerente de zona), approve, return. */
export function POST(request: Request, context: Ctx) {
  return withActor(request, async (actor) => {
    const { id } = await context.params;
    const body = await parseJson<{ action?: string; comment?: string }>(request);
    if (body.action === "submit") return submitPlan(id, actor);
    if (body.action === "approve") return decidePlan(id, "aprobado", body.comment, actor);
    if (body.action === "return") return decidePlan(id, "devuelto", body.comment, actor);
    throw new DomainError("action debe ser submit, approve o return");
  });
}
