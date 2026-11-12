import { withActor } from "@/lib/route";
import { revokeAccess } from "@/lib/stores";

export const runtime = "nodejs";

export function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  return withActor(request, async (actor) => {
    const { id } = await context.params;
    return { access: revokeAccess(id, actor) };
  });
}
