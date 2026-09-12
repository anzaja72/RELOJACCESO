import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

function key(): Buffer {
  const raw =
    process.env.TEMPLATE_KEY ||
    process.env.DEMO_API_KEY ||
    "reloj-cr-template-key-v1";
  return createHash("sha256").update(raw).digest();
}

export function sealJson(value: unknown): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const enc = Buffer.concat([cipher.update(JSON.stringify(value), "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1:${iv.toString("base64")}:${tag.toString("base64")}:${enc.toString("base64")}`;
}

export function openJson<T>(packed: string): T {
  if (!packed.startsWith("v1:")) return JSON.parse(packed) as T;
  const [, ivB, tagB, dataB] = packed.split(":");
  const decipher = createDecipheriv("aes-256-gcm", key(), Buffer.from(ivB, "base64"));
  decipher.setAuthTag(Buffer.from(tagB, "base64"));
  const out = Buffer.concat([
    decipher.update(Buffer.from(dataB, "base64")),
    decipher.final(),
  ]);
  return JSON.parse(out.toString("utf8")) as T;
}

export function hashSecret(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}
