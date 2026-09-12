import { listSites } from "@/lib/db";
import { json } from "@/lib/http";

export const runtime = "nodejs";

export function GET() {
  return json({ sites: listSites() });
}
