import { NextResponse } from "next/server";
import { DEMO_API_KEY } from "@/lib/config";

export function readApiKey(request: Request): string | null {
  const header = request.headers.get("x-api-key");
  if (header) return header.trim();
  const auth = request.headers.get("authorization");
  if (auth?.toLowerCase().startsWith("bearer ")) {
    return auth.slice(7).trim();
  }
  return null;
}

export function requireAdmin(request: Request): NextResponse | null {
  const key = readApiKey(request);
  if (!key || key !== DEMO_API_KEY) {
    return NextResponse.json(
      {
        error: "No autorizado",
        hint: "Envíe el token demo en X-API-Key o Authorization: Bearer",
      },
      { status: 401 },
    );
  }
  return null;
}
