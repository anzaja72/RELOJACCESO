import { isKioskDenied, kioskSite, kioskTerminalId, requireActor, requireKiosk } from "@/lib/auth";
import { DUPLICATE_COOLDOWN_MS } from "@/lib/config";
import { eventTypes } from "@/lib/db-ops";
import { listPunches, recentDuplicate, upsertPunch } from "@/lib/db";
import { badRequest, json, parseJson, rateLimit, serverError } from "@/lib/http";
import { filterBySite } from "@/lib/scope";
import type { SyncItem } from "@/lib/types";

export const runtime = "nodejs";

export function GET(request: Request) {
  const actor = requireActor(request);
  if (actor instanceof Response) return actor;
  const url = new URL(request.url);
  const punches = filterBySite(
    actor,
    listPunches({
      siteId: url.searchParams.get("site") ?? undefined,
      from: url.searchParams.get("from") ?? undefined,
      to: url.searchParams.get("to") ?? undefined,
      limit: url.searchParams.get("limit")
        ? Number(url.searchParams.get("limit"))
        : 200,
    }),
    (p) => p.siteId,
  );
  return json({ punches });
}

export async function POST(request: Request) {
  const limited = rateLimit(request);
  if (limited) return limited;
  const caller = requireKiosk(request);
  if (isKioskDenied(caller)) return caller;
  try {
    const body = await parseJson<Partial<SyncItem> & { offline?: boolean }>(
      request,
    );
    body.siteId = kioskSite(caller, body.siteId);
    body.terminalId = kioskTerminalId(caller, body.terminalId);
    if (!body.id || !body.siteId || !body.type || !body.capturedAt || !body.terminalId) {
      return badRequest("id, siteId, type, capturedAt y terminalId son obligatorios");
    }
    if (!eventTypes().includes(body.type)) {
      return badRequest(`type debe ser uno de: ${eventTypes().join(", ")}`);
    }

    let decision = body.decision ?? (body.employeeId ? "matched" : "unknown");
    if (body.employeeId && decision === "matched") {
      const dup = recentDuplicate({
        employeeId: body.employeeId,
        type: body.type,
        capturedAt: body.capturedAt,
        cooldownMs: DUPLICATE_COOLDOWN_MS,
      });
      if (dup) decision = "duplicate";
    }

    const result = upsertPunch({
      id: body.id,
      employeeId: body.employeeId ?? null,
      siteId: body.siteId,
      type: body.type,
      capturedAt: body.capturedAt,
      terminalId: body.terminalId,
      matchScore: body.matchScore ?? null,
      decision,
      livenessHint: body.livenessHint ?? "skipped",
      offline: Boolean(body.offline),
    });
    return json({ punch: result.punch, created: result.created }, result.created ? 201 : 200);
  } catch (error) {
    return serverError(error);
  }
}
