import { readFileSync } from "node:fs";
import path from "node:path";

export const runtime = "nodejs";

export function GET() {
  const file = path.join(process.cwd(), "public", "openapi.yaml");
  return new Response(readFileSync(file, "utf8"), {
    headers: { "Content-Type": "application/yaml; charset=utf-8" },
  });
}
