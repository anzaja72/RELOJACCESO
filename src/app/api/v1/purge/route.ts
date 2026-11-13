import { parseJson } from "@/lib/http";
import { purgeStores } from "@/lib/purge";
import { withActor } from "@/lib/route";
import { DomainError } from "@/lib/stores";

export const runtime = "nodejs";

/**
 * Limpieza de datos de demostración (solo superadmin con sesión).
 * { keep: ["AP","BV"], execute?: boolean, confirm?: "BORRAR" }
 * Sin `execute` solo calcula y devuelve lo que se borraría.
 */
export function POST(request: Request) {
  return withActor(request, async (actor) => {
    const body = await parseJson<{ keep?: unknown; execute?: boolean; confirm?: string }>(request);
    const keep = Array.isArray(body.keep) ? body.keep.map((k) => String(k).trim()).filter(Boolean) : [];
    if (body.execute && body.confirm !== "BORRAR") throw new DomainError("Para ejecutar envíe confirm: \"BORRAR\"");
    return purgeStores({ keep, execute: Boolean(body.execute) }, actor);
  });
}
