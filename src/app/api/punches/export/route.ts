import { isResponse } from "@/lib/auth";
import { filterBySite, requireReader } from "@/lib/scope";
import { listPunches } from "@/lib/db";

export const runtime = "nodejs";

function csvEscape(value: unknown) {
  const raw = value == null ? "" : String(value);
  // Neutraliza fórmulas de hoja de cálculo (=, +, -, @, tab, CR al inicio).
  const text = /^[=+\-@\t\r]/.test(raw) ? `'${raw}` : raw;
  if (/[",\n\r]/.test(text)) return `"${text.replaceAll('"', '""')}"`;
  return text;
}

export function GET(request: Request) {
  const actor = requireReader(request);
  if (isResponse(actor)) return actor;
  const url = new URL(request.url);
  const punches = filterBySite(actor, listPunches({
    siteId: url.searchParams.get("site") ?? undefined,
    from: url.searchParams.get("from") ?? undefined,
    to: url.searchParams.get("to") ?? undefined,
    limit: 500,
  }), (p) => p.siteId);
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
