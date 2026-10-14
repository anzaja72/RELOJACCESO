import { createHmac } from "node:crypto";

export function postSigned(
  url: string,
  type: string,
  payload: unknown,
  secret = process.env.WEBHOOK_SECRET || "demo-webhook-secret",
): Promise<Response> {
  const body = JSON.stringify({
    id: crypto.randomUUID(),
    type,
    payload,
    createdAt: new Date().toISOString(),
  });
  const signature = createHmac("sha256", secret).update(body).digest("hex");
  return fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Reloj-Signature": `sha256=${signature}`,
    },
    body,
    signal: AbortSignal.timeout(2500),
  });
}

export function dispatchWebhook(type: string, payload: unknown) {
  const url = process.env.WEBHOOK_URL;
  if (!url || type.startsWith("seed.")) return;
  // ponytail: fire-and-forget; no cola durable. Upgrade: outbox + retry.
  void postSigned(url, type, payload).catch(() => undefined);
}
