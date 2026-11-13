import { query, withActor } from "@/lib/route";
import { payrollHours } from "@/lib/stores";

export const runtime = "nodejs";

/**
 * Horas de un período para el corte de nómina: ?from=AAAA-MM-DD&to=AAAA-MM-DD&site=&zone=&employee=
 * Horas por categoría legal (ordinarias, nocturnas, dominicales/festivas, extras), tardanzas, almuerzos,
 * ausencias y novedades. Sin salarios ni valores: los liquida el sistema de nómina.
 */
export function GET(request: Request) {
  const q = query(request);
  return withActor(request, (actor) =>
    payrollHours(actor, { from: q("from") ?? "", to: q("to") ?? "", siteId: q("site"), zoneId: q("zone"), employeeId: q("employee") }),
  );
}
