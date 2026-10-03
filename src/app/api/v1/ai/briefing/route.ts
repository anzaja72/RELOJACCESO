import { generateBriefing } from "@/lib/ai-briefing";
import { llmInfo } from "@/lib/ai-llm";
import { isResponse, requireActor } from "@/lib/auth";
import { siteInScope } from "@/lib/scope";
import { getDb, recordEvent } from "@/lib/db";
import { json, rateLimit, serverError } from "@/lib/http";

export const runtime = "nodejs";

export async function GET(request: Request) {
  return POST(request);
}

export async function POST(request: Request) {
  const limited = rateLimit(request, 20);
  if (limited) return limited;
  const actor = requireActor(request);
  if (isResponse(actor)) return actor;
  try {
    const url = new URL(request.url);
    const site = url.searchParams.get("site") ?? undefined;
    if (site && !siteInScope(actor, site)) {
      return json({ error: "Sede fuera de su alcance", code: "FORBIDDEN" }, 403, request);
    }
    const briefing = await generateBriefing({
      day: url.searchParams.get("day") ?? undefined,
      siteId: site,
      scope: { role: actor.role, scopeType: actor.scopeType, scopeId: actor.scopeId },
    });
    recordEvent(getDb(), "ai.briefing", {
      actor: actor.email,
      day: briefing.day,
      source: briefing.source,
    });
    return json({ briefing, llm: llmInfo() }, 200, request);
  } catch (error) {
    return serverError(error, request);
  }
}
