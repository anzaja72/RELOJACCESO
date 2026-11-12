import { parseJson } from "@/lib/http";
import { withActor } from "@/lib/route";
import { listEmployeeTypes, saveEmployeeType, type EmployeeType } from "@/lib/stores";

export const runtime = "nodejs";

export function GET(request: Request) {
  return withActor(request, () => ({ types: listEmployeeTypes() }));
}

export function POST(request: Request) {
  return withActor(request, async (actor) => ({
    type: saveEmployeeType(await parseJson<Partial<EmployeeType>>(request), actor),
  }));
}
