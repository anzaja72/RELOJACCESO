import { createHash } from "node:crypto";
import { TIMEZONE, dayBoundsUtc } from "@/lib/config";
import { getDb, getEmployee, listPunches, listSites } from "@/lib/db";
import { integrityReport, laborRules } from "@/lib/db-ops";
import { analyzeLabor } from "@/lib/labor";

const stamp = (iso: string) =>
  new Intl.DateTimeFormat("sv-SE", {
    timeZone: TIMEZONE,
    dateStyle: "short",
    timeStyle: "medium",
  }).format(new Date(iso));

const pad = (s: string | number, n: number) => String(s).padEnd(n).slice(0, n);

/**
 * Expediente de asistencia de un trabajador para un rango de días locales
 * (YYYY-MM-DD, ambos incluidos): lo que hace falta para sustentar una reclamación
 * laboral. Devuelve las líneas del documento y su huella SHA-256.
 */
export function buildDossier(input: { employeeId: string; from: string; to: string; generatedBy: string }) {
  const employee = getEmployee(input.employeeId);
  if (!employee) return null;
  const db = getDb();
  const site = listSites().find((s) => s.id === employee.siteId);
  const rules = laborRules();
  const range = { from: dayBoundsUtc(input.from).from, to: dayBoundsUtc(input.to).to };
  const punches = listPunches({ employeeId: employee.id, ...range, order: "asc", limit: 5000 });
  const corrections = db
    .prepare(
      `SELECT c.* FROM corrections c JOIN punches p ON p.id = c.punch_id
       WHERE p.employee_id = ? AND p.captured_at >= ? AND p.captured_at <= ? ORDER BY c.created_at`,
    )
    .all(employee.id, range.from, range.to) as Array<Record<string, string>>;

  // Solo las marcas reconocidas o autorizadas por PIN cuentan como tiempo trabajado.
  const worked = punches.filter((p) => p.decision === "matched" || p.decision === "queued");
  const labor = analyzeLabor(worked, TIMEZONE, rules);
  const totalHours = Math.round(labor.days.reduce((sum, d) => sum + d.hours, 0) * 100) / 100;
  const integrity = integrityReport();
  const bad = new Map(integrity.punches.mismatches.map((m) => [m.id, m]));
  const flagged = punches.filter((p) => bad.has(p.id));

  const lines: string[] = [
    `Trabajador: ${employee.name} (codigo ${employee.code})   Cargo: ${employee.role}`,
    `Sede: ${site?.name ?? employee.siteId}   Estado: ${employee.active ? "activo" : "inactivo"}`,
    `Consentimiento biometrico: ${employee.consentAt ? stamp(employee.consentAt) : "no registrado"}`,
    `Periodo: ${input.from} a ${input.to} (hora de ${TIMEZONE})`,
    `Generado: ${stamp(new Date().toISOString())} por ${input.generatedBy}`,
    "",
    "RESUMEN",
    `Dias con trabajo: ${labor.days.length}   Horas trabajadas: ${totalHours}   Marcaciones: ${punches.length}`,
    `Por PIN de supervisor: ${punches.filter((p) => p.method === "supervisor_pin").length}   Sin salida o entrada pareada: ${labor.orphans}`,
    `Correcciones aprobadas: ${corrections.length}`,
    "",
    "ALERTAS DE JORNADA",
    `(limites configurados: ${rules.maxDailyHours} h/dia, ${rules.maxWeeklyHours} h/semana; semanas cortadas por el periodo son parciales)`,
    ...(labor.findings.length ? labor.findings.map((f) => `- ${f.message}`) : ["Sin alertas en el periodo."]),
    "",
    "HORAS POR DIA",
    ...(labor.days.length ? labor.days.map((d) => `${d.date}  ${d.hours} h`) : ["Sin horas pareadas."]),
    "",
    "MARCACIONES",
    `${pad("Fecha y hora", 20)}${pad("Tipo", 6)}${pad("Decision", 11)}${pad("Metodo", 14)}${pad("Terminal", 14)}Verif.`,
    ...(punches.length
      ? punches.map(
          (p) =>
            `${pad(stamp(p.capturedAt), 20)}${pad(p.type, 6)}${pad(p.decision, 11)}${pad(p.method ?? "face", 14)}${pad(p.terminalId, 14)}${bad.has(p.id) ? "ALTERADA" : "ok"}`,
        )
      : ["Sin marcaciones en el periodo."]),
    "",
    "CORRECCIONES",
    ...(corrections.length
      ? corrections.flatMap((c) => {
          const patch = JSON.parse(c.patch) as { previous: { ts: string; type: string }; next: { ts: string; type: string } };
          return [
            `${stamp(c.created_at)}  marca ${c.punch_id.slice(-8)}: ${stamp(patch.previous.ts)} ${patch.previous.type} -> ${stamp(patch.next.ts)} ${patch.next.type}`,
            `   Motivo: ${c.reason}   Solicito: ${c.requested_by}   Aprobo: ${c.approved_by}`,
          ];
        })
      : ["Sin correcciones."]),
    "",
    "INTEGRIDAD DEL REGISTRO",
    `Cadena de eventos: ${integrity.chain.ok ? "integra" : `ROTA (${integrity.chain.reason})`}   Sellada desde: ${integrity.chainSince ? stamp(integrity.chainSince) : "n/d"}`,
    `Ultimo sello: ${integrity.head ?? "n/d"}`,
    `Marcaciones del periodo alteradas respecto al registro sellado: ${flagged.length}`,
    "Las marcaciones anteriores a la fecha de sellado no pueden probarse con este mecanismo.",
  ];

  const body = lines.join("\n");
  const sha256 = createHash("sha256").update(body).digest("hex");
  lines.push(
    "",
    `Huella SHA-256 del contenido anterior: ${sha256}`,
    "Registro tecnico generado por el sistema. Su valor probatorio y la interpretacion de",
    "los limites de jornada deben validarse con el abogado laboral de la empresa.",
  );
  return {
    title: "EXPEDIENTE DE ASISTENCIA Y CUMPLIMIENTO LABORAL",
    lines,
    sha256,
    filename: `expediente-${employee.code}-${input.from}_${input.to}.pdf`.replace(/[^\w.-]/g, "_"),
    employee,
  };
}
