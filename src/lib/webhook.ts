import { createHmac } from "node:crypto";

export function dispatchWebhook(type: string, payload: unknown) {
  const url = process.env.WEBHOOK_URL;
  if (!url || type.startsWith("seed.")) return;
  const body = JSON.stringify({
    id: crypto.randomUUID(),
    type,
    payload,
    createdAt: new Date().toISOString(),
  });
  const secret = process.env.WEBHOOK_SECRET || "demo-webhook-secret";
  const signature = createHmac("sha256", secret).update(body).digest("hex");
  // ponytail: fire-and-forget; no cola durable. Upgrade: outbox + retry.
  void fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Reloj-Signature": `sha256=${signature}`,
    },
    body,
    signal: AbortSignal.timeout(2500),
  }).catch(() => undefined);
}
