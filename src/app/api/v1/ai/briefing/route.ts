import { generateBriefing } from "@/lib/ai-briefing";
import { llmInfo } from "@/lib/ai-llm";
import { isResponse, requireActor } from "@/lib/auth";
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
    const briefing = await generateBriefing({
      day: url.searchParams.get("day") ?? undefined,
      siteId: url.searchParams.get("site") ?? undefined,
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
