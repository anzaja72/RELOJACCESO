// Diagnóstico de la clave de IA: hace una llamada mínima y dice qué respondió el proveedor.
// Uso (dentro del contenedor): node scripts/llm-check.mjs
// No imprime la clave.
const key = process.env.NVIDIA_API_KEY || process.env.LLM_API_KEY || "";
const base = (process.env.NVIDIA_BASE_URL || "https://integrate.api.nvidia.com/v1").replace(/\/$/, "");
const model = process.env.NVIDIA_MODEL || process.env.LLM_MODEL || "nvidia/nemotron-3-ultra-550b-a55b";
console.log("proveedor forzado:", process.env.LLM_PROVIDER || "(ninguno)");
console.log("clave presente:", key ? `sí (${key.length} caracteres, empieza por ${key.slice(0, 5)}…)` : "NO");
console.log("endpoint:", base, "| modelo:", model);
if (!key) process.exit(1);

for (const thinking of [false, true]) {
  const t0 = Date.now();
  try {
    const res = await fetch(`${base}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model,
        max_tokens: 64,
        messages: [{ role: "user", content: "Responde solo: ok" }],
        chat_template_kwargs: { enable_thinking: thinking },
      }),
      signal: AbortSignal.timeout(60000),
    });
    const text = await res.text();
    console.log(`\n[thinking=${thinking}] HTTP ${res.status} en ${Date.now() - t0} ms`);
    console.log(text.slice(0, 400));
  } catch (err) {
    console.log(`\n[thinking=${thinking}] error de red tras ${Date.now() - t0} ms:`, err.name, err.message);
  }
}
