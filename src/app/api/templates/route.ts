import { isKioskDenied, isResponse, requireKiosk, resolveKioskSite } from "@/lib/auth";
import { kioskGallery } from "@/lib/stores";
import { json } from "@/lib/http";

export const runtime = "nodejs";

export function GET(request: Request) {
  const caller = requireKiosk(request);
  if (isKioskDenied(caller)) return caller;
  const resolved = resolveKioskSite(request, caller, new URL(request.url).searchParams.get("site"));
  if (isResponse(resolved)) return resolved;
  if (!resolved.site) return json({ error: "Indique la sede", code: "VALIDATION" }, 400);
  // Activos de la región de la tienda, con `authorized` según sus permisos vigentes (RF-09/RF-12):
  // así quien marca fuera de su tienda queda como excepción en vez de perderse.
  return json(kioskGallery(resolved.site));
}
