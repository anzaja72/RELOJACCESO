import { isKioskDenied, isResponse, kioskTerminalId, requireKiosk, resolveKioskSite } from "@/lib/auth";
import { DUPLICATE_COOLDOWN_MS } from "@/lib/config";
import { employeePunchableAtSite, recentDuplicate, upsertPunch } from "@/lib/db";
import { badRequest, json, parseJson, rateLimit, serverError } from "@/lib/http";
import type { SyncItem } from "@/lib/types";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const limited = rateLimit(request, 30);
  if (limited) return limited;
  const caller = requireKiosk(request);
  if (isKioskDenied(caller)) return caller;
  try {
    const body = await parseJson<{ punches?: SyncItem[] }>(request);
    const items = body.punches ?? [];
    if (!Array.isArray(items) || items.length === 0) {
      return badRequest("punches[] es obligatorio");
    }
    const accepted: string[] = [];
    const duplicates: string[] = [];
    for (const item of items) {
      const resolvedSite = resolveKioskSite(request, caller, item.siteId);
      if (isResponse(resolvedSite)) continue;
      item.siteId = resolvedSite.site ?? "";
      item.terminalId = kioskTerminalId(caller, item.terminalId);
      if (!item.id || !item.siteId || !item.type || !item.capturedAt || !item.terminalId) {
        continue;
      }
      if (item.employeeId && !employeePunchableAtSite(item.employeeId, item.siteId)) continue;
      let decision = item.decision;
      if (item.employeeId && decision === "matched") {
        const dup = recentDuplicate({
          employeeId: item.employeeId,
          type: item.type,
          capturedAt: item.capturedAt,
          cooldownMs: DUPLICATE_COOLDOWN_MS,
        });
        if (dup) decision = "duplicate";
      }
      const result = upsertPunch({ ...item, decision, offline: true });
      if (result.created) accepted.push(item.id);
      else duplicates.push(item.id);
    }
    return json({ ok: true, accepted, duplicates, received: items.length });
  } catch (error) {
    return serverError(error);
  }
}
