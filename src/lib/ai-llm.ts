export type LlmInfo = {
  provider: "nvidia" | "openai" | "anthropic" | "compatible" | "none";
  model: string | null;
};

function forced() {
  return (process.env.LLM_PROVIDER || "").trim().toLowerCase();
}

export function llmInfo(): LlmInfo {
  const want = forced();
  if (want === "none") return { provider: "none", model: null };

  if (want === "nvidia" || (!want && process.env.NVIDIA_API_KEY)) {
    return {
      provider: "nvidia",
      model: process.env.NVIDIA_MODEL || process.env.LLM_MODEL || "nvidia/nemotron-3-ultra-550b-a55b",
    };
  }
  if (want === "openai" || (!want && process.env.OPENAI_API_KEY)) {
    return { provider: "openai", model: process.env.OPENAI_MODEL || "gpt-4o-mini" };
  }
  if (want === "anthropic" || (!want && process.env.ANTHROPIC_API_KEY)) {
    return { provider: "anthropic", model: process.env.ANTHROPIC_MODEL || "claude-3-5-haiku-latest" };
  }
  if (
    want === "compatible" ||
    (process.env.LLM_BASE_URL && (process.env.LLM_API_KEY || process.env.NVIDIA_API_KEY || process.env.OPENAI_API_KEY))
  ) {
    return { provider: "compatible", model: process.env.LLM_MODEL || "gpt-4o-mini" };
  }
  if (process.env.NVIDIA_API_KEY) {
    return {
      provider: "nvidia",
      model: process.env.NVIDIA_MODEL || "nvidia/nemotron-3-ultra-550b-a55b",
    };
  }
  return { provider: "none", model: null };
}

export async function llmComplete(system: string, user: string): Promise<string | null> {
  const info = llmInfo();
  if (info.provider === "none") return null;
  const timeoutMs = Number(process.env.LLM_TIMEOUT_MS || (info.provider === "nvidia" ? "90000" : "12000"));
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
          max_tokens: Number(process.env.LLM_MAX_TOKENS || "700"),
          system,
          messages: [{ role: "user", content: user }],
        }),
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!res.ok) return null;
      const data = (await res.json()) as { content?: Array<{ text?: string }> };
      return data.content?.[0]?.text ?? null;
    }

    const nvidia = info.provider === "nvidia";
    const base = nvidia
      ? (process.env.NVIDIA_BASE_URL || "https://integrate.api.nvidia.com/v1").replace(/\/$/, "")
      : info.provider === "compatible"
        ? process.env.LLM_BASE_URL!.replace(/\/$/, "")
        : "https://api.openai.com/v1";
    const key = nvidia
      ? process.env.NVIDIA_API_KEY || process.env.LLM_API_KEY || ""
      : info.provider === "compatible"
        ? process.env.LLM_API_KEY || process.env.NVIDIA_API_KEY || process.env.OPENAI_API_KEY || ""
        : process.env.OPENAI_API_KEY || "";
    if (!key) return null;

    const thinking = process.env.LLM_ENABLE_THINKING !== "0";
    const payload = nvidia
      ? {
          model: info.model,
          temperature: Number(process.env.LLM_TEMPERATURE || "0.2"),
          top_p: Number(process.env.LLM_TOP_P || "0.95"),
          max_tokens: Number(process.env.LLM_MAX_TOKENS || "2048"),
          messages: [
            { role: "system", content: system },
            { role: "user", content: user },
          ],
          chat_template_kwargs: { enable_thinking: thinking },
          reasoning_budget: Number(process.env.LLM_REASONING_BUDGET || "4096"),
        }
      : {
          model: info.model,
          temperature: Number(process.env.LLM_TEMPERATURE || "0.2"),
          messages: [
            { role: "system", content: system },
            { role: "user", content: user },
          ],
        };

    const res = await fetch(`${base}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      choices?: Array<{ message?: { content?: string | Array<{ type?: string; text?: string }> } }>;
    };
    const content = data.choices?.[0]?.message?.content;
    if (typeof content === "string") return content;
    if (Array.isArray(content)) {
      return content.map((p) => p.text || "").join("\n").trim() || null;
    }
    return null;
  } catch {
    return null;
  }
}
