import { generateBriefing } from "@/lib/ai-briefing";
import { llmComplete, llmInfo } from "@/lib/ai-llm";
import { listPunches } from "@/lib/db";
import {
  listCorrections,
  listEmployeesScoped,
  reportDashboard,
  reportForDay,
  siteIdsForRegion,
  siteIdsForScope,
  todayLocal,
  type Scope,
} from "@/lib/db-ops";
import { listAnomalies } from "@/lib/anomalies";
import { extractWidgets, type Widget } from "@/lib/ai-widgets";
import { listSites, listTerminals } from "@/lib/db";
import { dayBoundsUtc } from "@/lib/config";

export type ChatCite = { type: string; id: string };
export type ChatAnswer = {
  answer: string;
  intent: string;
  cites: ChatCite[];
  source: "llm" | "canned";
  missing: boolean;
  widgets?: Widget[];
};

const REFUSE =
  "No puedo aconsejar sanciones, despidos ni temas legales. Use los ids citados y el proceso de RR.HH. de la empresa.";

function detectIntent(q: string): string {
  const s = q.toLowerCase();
  if (/sanci[oó]n|despido|despedir|castig|multa|abogad|legal|demand/.test(s)) return "refuse";
  if (/correccion|correcci[oó]n/.test(s)) return "corrections";
  if (/sync|sincr|cola offline|cola\b/.test(s)) return "sync";
  if (/terminal|kiosco|offline|en l[ií]nea/.test(s)) return "terminals";
  if (/atras|tard/.test(s)) return "late";
  if (/ausent/.test(s)) return "absent";
  if (/present|qui[eé]n est[aá]|quienes est/.test(s)) return "present";
  if (/omisi/.test(s)) return "omission";
  if (/anomal|pin supervisor|buddy/.test(s)) return "anomalies";
  if (/briefing|resumen|hoy/.test(s)) return "briefing";
  return "unknown";
}

function retrieve(
  intent: string,
  day: string,
  siteId?: string,
  scope?: Scope,
  countryId?: string,
  zoneId?: string,
) {
  const report = reportForDay({ day, siteId, scope, countryId, zoneId });
  const siteLabel = new Map(listSites().map((x) => [x.id, `${x.code} ${x.name}`]));
  // Dos filtros distintos: el alcance de quien pregunta (obligatorio) y la región que eligió (opcional).
  const allowed = scope ? siteIdsForScope(scope) : [];
  const inSites = (site: string | null | undefined) => !allowed || (site != null && allowed.includes(site));
  const reg = siteIdsForRegion(countryId, zoneId);
  const inRegion = (site: string | null | undefined) => !reg || (site != null && reg.has(site));
  const punches = listPunches({
    siteId,
    ...dayBoundsUtc(day),
    limit: 300,
  }).filter((p) => inSites(p.siteId) && inRegion(p.siteId));
  if (intent === "present") {
    const rows = report.rows.filter((r) => ["present", "on_time", "late"].includes(r.status));
    return {
      label: "presentes",
      rows: rows.map((r) => ({
        employeeId: r.employee.id,
        name: r.employee.name,
        site: siteLabel.get(r.employee.siteId) ?? r.employee.siteId,
        status: r.status,
        punchId: r.lastPunch?.id ?? null,
      })),
    };
  }
  if (intent === "late") {
    return {
      label: "atrasos",
      rows: report.rows
        .filter((r) => r.status === "late")
        .map((r) => ({
          employeeId: r.employee.id,
          name: r.employee.name,
        site: siteLabel.get(r.employee.siteId) ?? r.employee.siteId,
          lateMin: r.lateMin,
          punchId: r.lastPunch?.id ?? null,
        })),
    };
  }
  if (intent === "absent") {
    return {
      label: "ausencias",
      rows: report.rows
        .filter((r) => r.status === "absent")
        .map((r) => ({
          employeeId: r.employee.id,
          name: r.employee.name,
          site: siteLabel.get(r.employee.siteId) ?? r.employee.siteId,
        })),
    };
  }
  if (intent === "omission") {
    return {
      label: "omisiones",
      rows: report.rows
        .filter((r) => r.status === "omission")
        .map((r) => ({
          employeeId: r.employee.id,
          name: r.employee.name,
        site: siteLabel.get(r.employee.siteId) ?? r.employee.siteId,
          punchId: r.lastPunch?.id ?? null,
        })),
    };
  }
  if (intent === "terminals") {
    return {
      label: "terminales",
      rows: listTerminals()
        .filter((t) => inSites(t.siteId) && inRegion(t.siteId))
        .filter((t) => !siteId || t.siteId === siteId)
        .map((t) => ({ id: t.id, label: t.label, online: t.online, lastSeen: t.lastSeen })),
    };
  }
  if (intent === "sync") {
    return {
      label: "sync",
      rows: punches
        .filter((p) => p.offline)
        .map((p) => ({ punchId: p.id, employeeId: p.employeeId, capturedAt: p.capturedAt })),
    };
  }
  if (intent === "corrections") {
    return {
      label: "correcciones",
      rows: (listCorrections(undefined, allowed) as Array<Record<string, unknown>>).slice(0, 30).map((c) => ({
        id: c.id,
        punchId: c.punch_id,
        reason: c.reason,
        approvedBy: c.approved_by,
        createdAt: c.created_at,
      })),
    };
  }
  if (intent === "anomalies") {
    return {
      label: "anomalías",
      rows: listAnomalies({ day, siteId })
        .filter((a) => inSites(a.siteId) && (!a.siteId || inRegion(a.siteId)))
        .map((a) => ({
          id: a.id,
          kind: a.kind,
          message: a.message,
          punchIds: a.punchIds,
          reviewed: a.reviewed,
        })),
    };
  }
  return { label: intent, rows: [] as unknown[] };
}

function canned(intent: string, day: string, siteId: string | undefined, data: { label: string; rows: unknown[] }): ChatAnswer {
  const href = `/reports?day=${day}${siteId ? `&site=${siteId}` : ""}`;
  if (intent === "unknown") {
    return {
      answer: "[NO ENCONTRADO] Solo respondo presentes, atrasos, ausencias, terminales, sync y correcciones.",
      intent,
      cites: [],
      source: "canned",
      missing: true,
    };
  }
  if (data.rows.length === 0) {
    return {
      answer: `[NO ENCONTRADO] No hay ${data.label} para ${day} en el alcance consultado. Vista: ${href}`,
      intent,
      cites: [],
      source: "canned",
      missing: true,
    };
  }
  const lines = data.rows.slice(0, 12).map((row) => JSON.stringify(row));
  const cites: ChatCite[] = [];
  for (const row of data.rows as Array<Record<string, unknown>>) {
    if (row.punchId) cites.push({ type: "punch", id: String(row.punchId) });
    if (row.employeeId) cites.push({ type: "employee", id: String(row.employeeId) });
    if (row.id && data.label !== "correcciones") cites.push({ type: data.label === "terminales" ? "terminal" : "id", id: String(row.id) });
    if (row.punch_id) cites.push({ type: "punch", id: String(row.punch_id) });
  }
  return {
    answer: `${data.label} (${day}, ${data.rows.length}):\n${lines.join("\n")}\nVista: ${href}`,
    intent,
    cites: cites.slice(0, 20),
    source: "canned",
    missing: false,
  };
}

export async function answerChat(input: {
  question: string;
  day?: string;
  siteId?: string;
  countryId?: string;
  zoneId?: string;
  scope?: Scope;
}): Promise<ChatAnswer> {
  const day = input.day || todayLocal();
  const intent = detectIntent(input.question);
  if (intent === "refuse") {
    return { answer: REFUSE, intent, cites: [], source: "canned", missing: false };
  }
  if (intent === "briefing") {
    const briefing = await generateBriefing({
      day,
      siteId: input.siteId,
      countryId: input.countryId,
      zoneId: input.zoneId,
      scope: input.scope,
    });
    return {
      answer: briefing.bullets.map((b, i) => `${i + 1}. ${b.text} (${b.href})`).join("\n"),
      intent,
      cites: briefing.bullets.flatMap((b) => b.cites),
      source: briefing.source === "llm" ? "llm" : "canned",
      missing: false,
    };
  }
  const data = retrieve(intent, day, input.siteId, input.scope, input.countryId, input.zoneId);
  const fallback = canned(intent, day, input.siteId, data);
  const info = llmInfo();
  if (info.provider === "none") return fallback;
  // Análisis: el modelo recibe el día y el acumulado del mes ya consolidados (tasas, rankings,
  // comparativos); él los interpreta y redacta, no hace las cuentas.
  const facts = analysisFacts(input, day, data);
  const raw = await llmComplete(
    `Eres "IAnálisis de Reloj CR", analista de asistencia para gerentes de restaurantes. Responde en español, con el siguiente formato de texto plano (sin markdown, sin asteriscos ni almohadillas; usa "•" para viñetas):

Resumen: una o dos frases con la conclusión y la cifra clave.
Hallazgos: 3 a 5 viñetas con números concretos (conteos, porcentajes, minutos, comparaciones entre sedes, personas o días).
Dónde se concentra: qué sede, día o personas explican la mayor parte del problema.
Qué vigilar: 1 a 3 acciones operativas (ajustar turnos, reforzar una sede, revisar un horario, confirmar una excepción).

Reglas: usa SOLO los hechos dados; nómbralos por nombre y sede, no por id; cuando el periodo pedido (p. ej. "este mes") esté en los hechos, úsalo y di el periodo; si falta un dato, dilo en una línea y analiza lo que sí hay. Prohibido inventar cifras. Prohibido aconsejar sanciones, despidos o temas legales; habla de la operación, no de castigar personas. Máximo 220 palabras.

Además del texto, cuando haya cifras que comparar o una serie que mostrar, incluye de 1 a 3 bloques <ui-widget>{...}</ui-widget> con JSON válido en una sola línea, sin bloques de código markdown alrededor. Tipos disponibles (type):
• kpi_cards: items [{label, value (texto corto, p. ej. "155" o "17,3 %"), hint, tone: neutral|good|warn|bad}]
• bar_chart: title, unit, items [{label, value}] (comparar sedes, personas o categorías)
• line_chart: title, unit, points [{label, value}] (evolución diaria; mínimo 2 puntos)
• ranking: title, unit, items [{label, detail, value}] (personas o sedes ordenadas)
• comparison_table: title, columns [texto], rows [[texto, ...]] (cada fila con tantas celdas como columnas)
Usa solo cifras de los hechos. No repitas en el texto lo que ya muestra el bloque; el texto da la lectura, el bloque da los números.`,
    `Pregunta: ${input.question}\nHechos:\n${JSON.stringify(facts)}`,
  );
  if (!raw) return fallback;
  const { text, widgets } = extractWidgets(raw);
  if (!text && widgets.length === 0) return fallback;
  return {
    answer: text.replace(/\*\*/g, "").replace(/^#+\s*/gm, ""),
    intent,
    cites: fallback.cites,
    source: "llm",
    missing: raw.includes("[NO ENCONTRADO]") && (data.rows as unknown[]).length === 0,
    widgets,
  };
}

/** Hechos consolidados para el análisis: día consultado + acumulado del mes, con tasas y rankings. */
function analysisFacts(
  input: { siteId?: string; countryId?: string; zoneId?: string; scope?: Scope },
  day: string,
  data: { label: string; rows: unknown[] },
) {
  const month = day.slice(0, 7);
  const dash = reportDashboard({
    month,
    siteId: input.siteId,
    countryId: input.countryId,
    zoneId: input.zoneId,
    scope: input.scope,
  });
  const siteLabel = new Map(listSites().map((x) => [x.id, `${x.code} ${x.name}`]));
  const pct = (n: number, d: number) => (d > 0 ? Math.round((n / d) * 1000) / 10 : 0);
  const t = dash.totals;
  const registered = t.present + t.absent;
  const people = (dash.people as Array<{
    employee: { id: string; name: string; siteId: string };
    presentDays: number;
    lateDays: number;
    lateMin: number;
    avgLateMin: number;
    unjustified: number;
  }>).map((p) => ({
    nombre: p.employee.name,
    sede: siteLabel.get(p.employee.siteId) ?? p.employee.siteId,
    diasPresente: p.presentDays,
    diasTarde: p.lateDays,
    minutosTardeTotal: p.lateMin,
    minutosTardePromedio: p.avgLateMin,
    faltasInjustificadas: p.unjustified,
  }));
  const top = <T,>(rows: T[], key: (r: T) => number, n = 8) =>
    [...rows].sort((a, b) => key(b) - key(a)).filter((r) => key(r) > 0).slice(0, n);
  const series = dash.series as Array<{ day: string; present: number; absent: number; late: number }>;
  const byDay = series.map((s) => ({ dia: s.day, presentes: s.present, ausentes: s.absent, tarde: s.late }));
  const busiest = top(byDay, (r) => r.tarde, 3);
  const payroll = dash.payroll as Array<{ name: string; siteName: string; workedHours: number; extraDayHours: number; extraNightHours: number; extraHolidayHours: number }>;
  const extraOf = (p: (typeof payroll)[number]) => p.extraDayHours + p.extraNightHours + p.extraHolidayHours;
  return {
    diaConsultado: day,
    mes: month,
    diasTranscurridosDelMes: series.length,
    trabajadoresEnAlcance: people.length,
    trabajadoresDistintosQueLlegaronTardeEnElMes: people.filter((p) => p.diasTarde > 0).length,
    trabajadoresConFaltasInjustificadasEnElMes: people.filter((p) => p.faltasInjustificadas > 0).length,
    acumuladoMes: {
      marcacionesDiaPersona: registered,
      presentes: t.present,
      ausentes: t.absent,
      tarde: t.late,
      salidasAnticipadas: t.earlyOut,
      omisiones: t.omission,
      porcentajeTardeSobrePresentes: pct(t.late, t.present),
      porcentajeAusentesSobreRegistros: pct(t.absent, registered),
      promedioTardeAlDia: series.length ? Math.round((t.late / series.length) * 10) / 10 : 0,
    },
    diasConMasTarde: busiest,
    serieDiaria: byDay.slice(-31),
    porSede: (dash.sites as Array<{ name: string; presentDays: number; lateDays: number; lateMin: number; avgLateMin: number }>).map((s) => ({
      sede: s.name,
      diasPresente: s.presentDays,
      diasTarde: s.lateDays,
      porcentajeTarde: pct(s.lateDays, s.presentDays),
      minutosTardePromedio: s.avgLateMin,
    })),
    personasConMasTarde: top(people, (p) => p.diasTarde),
    personasConMasFaltasInjustificadas: top(people, (p) => p.faltasInjustificadas),
    horasExtraDelMes: {
      total: Math.round(payroll.reduce((s, p) => s + extraOf(p), 0) * 10) / 10,
      personasConMasHorasExtra: top(payroll, extraOf, 5).map((p) => ({
        nombre: p.name,
        sede: p.siteName,
        horasExtra: Math.round(extraOf(p) * 10) / 10,
        horasTrabajadas: p.workedHours,
      })),
    },
    detalleDelDia: { tipo: data.label, filas: (data.rows as unknown[]).slice(0, 40) },
  };
}

export function chatSeedHints() {
  return [
    "¿Quiénes están presentes hoy?",
    "¿Hay atrasos en R01?",
    "¿Qué terminales están offline?",
    "¿Hubo correcciones hoy?",
    "¿Falló alguna sincronización?",
  ];
}

export function listPeopleForChat(scope?: Scope) {
  return listEmployeesScoped(scope ?? { role: "auditor", scopeType: "all", scopeId: null }).map((e) => ({
    id: e.id,
    name: e.name,
    code: e.code,
    siteId: e.siteId,
  }));
}
