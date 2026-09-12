import { listEmployees, listTemplates } from "@/lib/db";
import { json } from "@/lib/http";

export const runtime = "nodejs";

export function GET(request: Request) {
  const site = new URL(request.url).searchParams.get("site") ?? undefined;
  return json({
    employees: listEmployees(site),
    templates: listTemplates(site),
  });
}
