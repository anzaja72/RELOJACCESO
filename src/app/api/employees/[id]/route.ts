import { getEmployee } from "@/lib/db";
import { json } from "@/lib/http";

export const runtime = "nodejs";

export function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  return context.params.then(({ id }) => {
    const employee = getEmployee(id);
    if (!employee) return json({ error: "No encontrado" }, 404);
    return json({ employee });
  });
}
