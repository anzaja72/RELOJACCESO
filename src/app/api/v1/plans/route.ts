import { parseJson } from "@/lib/http";
import { mondayOf } from "@/lib/planning";
import { query, withActor } from "@/lib/route";
import { getPlanView, openPlan, regionPlans } from "@/lib/stores";

export const runtime = "nodejs";

const thisWeek = () => mondayOf(new Date().toISOString().slice(0, 10));

/** GET ?site=&week= (una tienda) · ?scope=region&week= (todas las visibles). */
export function GET(request: Request) {
  const q = query(request);
  return withActor(request, (actor) => {
    const week = q("week") ?? thisWeek();
    if (q("scope") === "region") return { plans: regionPlans(actor, week) };
    if (!q("site")) return { plans: regionPlans(actor, week) };
    return getPlanView(q("site")!, week, actor);
  });
}

/** Abre el borrador de la semana o una nueva versión (con changeReason). */
export function POST(request: Request) {
  return withActor(request, async (actor) => {
    const body = await parseJson<{ siteId?: string; weekStart?: string; changeReason?: string }>(request);
    const plan = openPlan(body.siteId ?? "", body.weekStart ?? thisWeek(), actor, body.changeReason);
    return getPlanView(plan.siteId, plan.weekStart, actor, { planId: plan.id });
  }, 201);
}
