import { permissionsOf } from "@/lib/permissions";
import { withActor } from "@/lib/route";

export const runtime = "nodejs";

export function GET(request: Request) {
  return withActor(request, (actor) => ({ role: actor.role, permissions: permissionsOf(actor.role) }));
}
