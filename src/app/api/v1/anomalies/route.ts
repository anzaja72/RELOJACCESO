import { listAnomalies, scanAnomalies } from "@/lib/anomalies";
import { isResponse, requireActor, requireApprover } from "@/lib/auth";
import { filterBySite } from "@/lib/scope";
import { json } from "@/lib/http";

export const runtime = "nodejs";

export function GET(request: Request) {
  const actor = requireActor(request);
  if (isResponse(actor)) return actor;
  const url = new URL(request.url);
  const reviewed = url.searchParams.get("reviewed");
  const anomalies = listAnomalies({
    day: url.searchParams.get("day") ?? undefined,
    siteId: url.searchParams.get("site") ?? undefined,
    reviewed: reviewed === "1" ? true : reviewed === "0" ? false : undefined,
  });
  return json({ anomalies: filterBySite(actor, anomalies, (a) => a.siteId) }, 200, request);
}

export function POST(request: Request) {
  // Escanear crea registros: gerente de sede o superior (no operador ni auditor).
  const actor = requireApprover(request);
  if (isResponse(actor)) return actor;
  const url = new URL(request.url);
  const result = scanAnomalies(url.searchParams.get("day") ?? undefined);
  return json({ ...result, anomalies: filterBySite(actor, result.anomalies, (a) => a.siteId) }, 200, request);
}
