import { listAnomalies, scanAnomalies } from "@/lib/anomalies";
import { isResponse, requireActor } from "@/lib/auth";
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
  return json({ anomalies }, 200, request);
}

export function POST(request: Request) {
  const actor = requireActor(request);
  if (isResponse(actor)) return actor;
  const url = new URL(request.url);
  const result = scanAnomalies(url.searchParams.get("day") ?? undefined);
  return json(result, 200, request);
}
