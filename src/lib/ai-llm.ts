export type LlmInfo = {
  provider: "openai" | "anthropic" | "compatible" | "none";
  model: string | null;
};

export function llmInfo(): LlmInfo {
  if (process.env.OPENAI_API_KEY) {
    return { provider: "openai", model: process.env.OPENAI_MODEL || "gpt-4o-mini" };
  }
  if (process.env.ANTHROPIC_API_KEY) {
    return { provider: "anthropic", model: process.env.ANTHROPIC_MODEL || "claude-3-5-haiku-latest" };
  }
  if (process.env.LLM_BASE_URL && (process.env.LLM_API_KEY || process.env.OPENAI_API_KEY)) {
    return { provider: "compatible", model: process.env.LLM_MODEL || "gpt-4o-mini" };
  }
  return { provider: "none", model: null };
}

export async function llmComplete(system: string, user: string): Promise<string | null> {
  const info = llmInfo();
  if (info.provider === "none") return null;
  try {
    if (info.provider === "anthropic") {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": process.env.ANTHROPIC_API_KEY!,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: info.model,
          max_tokens: 700,
          system,
          messages: [{ role: "user", content: user }],
        }),
        signal: AbortSignal.timeout(12_000),
      });
      if (!res.ok) return null;
      const data = (await res.json()) as { content?: Array<{ text?: string }> };
      return data.content?.[0]?.text ?? null;
    }
    const base =
      info.provider === "compatible"
        ? process.env.LLM_BASE_URL!.replace(/\/$/, "")
        : "https://api.openai.com/v1";
    const key =
      info.provider === "compatible"
        ? process.env.LLM_API_KEY || process.env.OPENAI_API_KEY!
        : process.env.OPENAI_API_KEY!;
    const res = await fetch(`${base}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        model: info.model,
        temperature: 0.2,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
      }),
      signal: AbortSignal.timeout(12_000),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    return data.choices?.[0]?.message?.content ?? null;
  } catch {
    return null;
  }
}
