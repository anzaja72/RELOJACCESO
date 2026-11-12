import { recordEvent, getDb } from "@/lib/db";
import { toCsv, toXlsx } from "@/lib/pack";
import { can } from "@/lib/permissions";
import { fmtHours, mondayOf } from "@/lib/planning";
import { query, withActor } from "@/lib/route";
import { weeklyHours } from "@/lib/stores";

export const runtime = "nodejs";

/**
 * Control de horas (UI-09) y vista de RR. HH. (RF-15).
 * ?week=&site=&zone=&employee=&review=pendiente|ok&format=json|csv|xlsx
 * La exportación lleva fecha de corte y marca de registros pendientes; no es una nómina.
 */
export function GET(request: Request) {
  const q = query(request);
  return withActor(request, (actor) => {
    const week = mondayOf(q("week") ?? new Date().toISOString().slice(0, 10));
    const rows = weeklyHours(actor, {
      weekStart: week,
      siteId: q("site"),
      zoneId: q("zone"),
      employeeId: q("employee"),
      review: q("review") as "pendiente" | "ok" | undefined,
    });
    const format = q("format") ?? "json";
    if (format === "json") return { weekStart: week, cutAt: new Date().toISOString(), rows };
    const salary = can(actor.role, "employee.salary_view");
    const cutAt = new Date().toISOString();
    const flat = rows.map((r) => ({
      corte: cutAt,
      semana: week,
      documento: r.documentId ?? "",
      codigo: r.employeeCode,
      empleado: r.employeeName,
      tienda: r.siteName,
      cargo: r.role,
      tipo: r.typeName ?? "",
      ...(salary ? { salario: r.salary ?? "" } : {}),
      referencia_h: r.referenceMin == null ? "" : fmtHours(r.referenceMin),
      programadas_h: fmtHours(r.plannedMin),
      trabajadas_netas_h: fmtHours(r.workedMin),
      almuerzo_excluido_h: fmtHours(r.lunchMin),
      diferencia_h: fmtHours(r.diffMin),
      exceso_h: fmtHours(r.excessMin),
      bajo_minimo_h: fmtHours(r.shortfallMin),
      descansos: r.restDays,
      incidencias: r.incidents,
      exceso_estado: r.excessNovelty?.status ?? (r.excessMin > 0 ? "sin_registrar" : ""),
      pendiente_revision: r.pendingReview ? "SI" : "NO",
    }));
    recordEvent(getDb(), "hours.exported", { by: actor.email, week, format, rows: flat.length });
    const name = `horas-${week}`;
    if (format === "xlsx") {
      return new Response(Buffer.from(toXlsx("Horas", flat)), {
        headers: {
          "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "Content-Disposition": `attachment; filename="${name}.xlsx"`,
        },
      });
    }
    return new Response(`﻿${toCsv(flat)}`, {
      headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${name}.csv"` },
    });
  });
}
