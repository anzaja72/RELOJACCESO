import { generateBriefing } from "@/lib/ai-briefing";
import { llmComplete, llmInfo } from "@/lib/ai-llm";
import { listPunches } from "@/lib/db";
import { listCorrections, listEmployeesScoped, reportForDay, todayCR, type Scope } from "@/lib/db-ops";
import { listAnomalies } from "@/lib/anomalies";
import { listTerminals } from "@/lib/db";

export type ChatCite = { type: string; id: string };
export type ChatAnswer = {
  answer: string;
  intent: string;
  cites: ChatCite[];
  source: "llm" | "canned";
  missing: boolean;
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

function retrieve(intent: string, day: string, siteId?: string, scope?: Scope) {
  const report = reportForDay({ day, siteId, scope });
  const punches = listPunches({
    siteId,
    from: `${day}T00:00:00-06:00`,
    to: `${day}T23:59:59.999-06:00`,
    limit: 300,
  });
  if (intent === "present") {
    const rows = report.rows.filter((r) => ["present", "on_time", "late"].includes(r.status));
    return {
      label: "presentes",
      rows: rows.map((r) => ({
        employeeId: r.employee.id,
        name: r.employee.name,
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
        .map((r) => ({ employeeId: r.employee.id, name: r.employee.name })),
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
          punchId: r.lastPunch?.id ?? null,
        })),
    };
  }
  if (intent === "terminals") {
    return {
      label: "terminales",
      rows: listTerminals()
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
      rows: (listCorrections() as Array<Record<string, unknown>>).slice(0, 30).map((c) => ({
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
      rows: listAnomalies({ day, siteId }).map((a) => ({
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
  scope?: Scope;
}): Promise<ChatAnswer> {
  const day = input.day || todayCR();
  const intent = detectIntent(input.question);
  if (intent === "refuse") {
    return { answer: REFUSE, intent, cites: [], source: "canned", missing: false };
  }
  if (intent === "briefing") {
    const briefing = await generateBriefing({ day, siteId: input.siteId });
    return {
      answer: briefing.bullets.map((b, i) => `${i + 1}. ${b.text} (${b.href})`).join("\n"),
      intent,
      cites: briefing.bullets.flatMap((b) => b.cites),
      source: briefing.source === "llm" ? "llm" : "canned",
      missing: false,
    };
  }
  const data = retrieve(intent, day, input.siteId, input.scope);
  const fallback = canned(intent, day, input.siteId, data);
  const info = llmInfo();
  if (info.provider === "none" || intent === "unknown") return fallback;
  const raw = await llmComplete(
    `Eres "Pregunta a Reloj CR". Solo hablas de presentes, atrasos, ausencias, terminales, sync y correcciones. Español. Cita ids reales del JSON (punch/employee/terminal). Si el dato no está, responde exactamente [NO ENCONTRADO]. Prohibido inventar. Prohibido aconsejar sanciones o despidos.`,
    `Pregunta: ${input.question}\nHechos:\n${JSON.stringify({ day, siteId: input.siteId ?? null, intent, data })}`,
  );
  if (!raw) return fallback;
  return {
    answer: raw,
    intent,
    cites: fallback.cites,
    source: "llm",
    missing: raw.includes("[NO ENCONTRADO]"),
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
