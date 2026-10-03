import { answerChat, chatSeedHints } from "@/lib/ai-chat";
import { llmInfo } from "@/lib/ai-llm";
import { isResponse, requireActor } from "@/lib/auth";
import { siteInScope } from "@/lib/scope";
import { getDb, recordEvent } from "@/lib/db";
import { json, parseJson, rateLimit, serverError } from "@/lib/http";

export const runtime = "nodejs";

export function GET() {
  return json({
    hints: chatSeedHints(),
    llm: llmInfo(),
    scope: "presentes, atrasos, ausencias, terminales, sync, correcciones",
  });
}

export async function POST(request: Request) {
  const limited = rateLimit(request, 30);
  if (limited) return limited;
  const actor = requireActor(request);
  if (isResponse(actor)) return actor;
  try {
    const body = await parseJson<{ question?: string; day?: string; siteId?: string }>(request);
    if (!body.question?.trim()) {
      return json({ error: "question es obligatorio", code: "VALIDATION" }, 400, request);
    }
    if (body.siteId && !siteInScope(actor, body.siteId)) {
      return json({ error: "Sede fuera de su alcance", code: "FORBIDDEN" }, 403, request);
    }
    const result = await answerChat({
      question: body.question.trim(),
      day: body.day,
      siteId: body.siteId,
      scope: { role: actor.role, scopeType: actor.scopeType, scopeId: actor.scopeId },
    });
    recordEvent(getDb(), "ai.chat", {
      actor: actor.email,
      intent: result.intent,
      missing: result.missing,
    });
    return json({ ...result, llm: llmInfo() }, 200, request);
  } catch (error) {
    return serverError(error, request);
  }
}
