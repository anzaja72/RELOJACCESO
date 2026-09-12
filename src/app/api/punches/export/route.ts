import { requireAdmin } from "@/lib/auth";
import { listPunches } from "@/lib/db";

export const runtime = "nodejs";

function csvEscape(value: unknown) {
  const text = value == null ? "" : String(value);
  if (/[",\n]/.test(text)) return `"${text.replaceAll('"', '""')}"`;
  return text;
}

export function GET(request: Request) {
  const denied = requireAdmin(request);
  if (denied) return denied;
  const url = new URL(request.url);
  const punches = listPunches({
    siteId: url.searchParams.get("site") ?? undefined,
    from: url.searchParams.get("from") ?? undefined,
    to: url.searchParams.get("to") ?? undefined,
    limit: 500,
  });
  const header = [
    "id",
    "sede",
    "tipo",
    "decision",
    "colaborador",
    "codigo",
    "capturado",
    "recibido",
    "terminal",
    "score",
    "offline",
    "liveness_demo",
  ];
  const lines = [
    header.join(","),
    ...punches.map((p) =>
      [
        p.id,
        p.siteId,
        p.type,
        p.decision,
        p.employeeName,
        p.employeeCode,
        p.capturedAt,
        p.receivedAt,
        p.terminalId,
        p.matchScore,
        p.offline,
        p.livenessHint,
      ]
        .map(csvEscape)
        .join(","),
    ),
  ];
  return new Response(lines.join("\n"), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="marcaciones.csv"',
    },
  });
}
