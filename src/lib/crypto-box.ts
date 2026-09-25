import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { legacyTemplateKeys, templateKey } from "@/lib/secrets";

function derive(raw: string): Buffer {
  return createHash("sha256").update(raw).digest();
}

export function sealJson(value: unknown): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", derive(templateKey()), iv);
  const enc = Buffer.concat([cipher.update(JSON.stringify(value), "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1:${iv.toString("base64")}:${tag.toString("base64")}:${enc.toString("base64")}`;
}

function decrypt(raw: string, ivB: string, tagB: string, dataB: string) {
  const decipher = createDecipheriv("aes-256-gcm", derive(raw), Buffer.from(ivB, "base64"));
  decipher.setAuthTag(Buffer.from(tagB, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(dataB, "base64")), decipher.final()]);
}

export function openJson<T>(packed: string): T {
  if (!packed.startsWith("v1:")) return JSON.parse(packed) as T;
  const [, ivB, tagB, dataB] = packed.split(":");
  // Plantillas cifradas antes de TEMPLATE_KEY usaban DEMO_API_KEY o la clave de fábrica.
  const candidates = [templateKey(), ...legacyTemplateKeys()];
  let lastError: unknown;
  for (const raw of new Set(candidates)) {
    try {
      return JSON.parse(decrypt(raw, ivB, tagB, dataB).toString("utf8")) as T;
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError;
}

export function hashSecret(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}
