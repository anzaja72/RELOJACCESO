import { listAnomalies } from "@/lib/anomalies";
import { llmComplete, llmInfo } from "@/lib/ai-llm";
import { getDb, listPunches } from "@/lib/db";
import { listCorrections, reportForDay, siteIdsForScope, todayLocal, type Scope } from "@/lib/db-ops";
import { dayBoundsUtc } from "@/lib/config";

export type BriefingBullet = {
  text: string;
  href: string;
  cites: Array<{ type: "punch" | "employee" | "terminal" | "anomaly"; id: string }>;
};

export type Briefing = {
  day: string;
  siteId: string | null;
  source: "llm" | "template";
  provider: string;
  bullets: BriefingBullet[];
};

const SAFE_HREF = /^\/(reports|admin)(\?[A-Za-z0-9=&_%.-]*)?$/;

function qs(params: Record<string, string | null | undefined>) {
  const u = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v) u.set(k, v);
  }
  return u.toString();
}

/** Sedes permitidas para el alcance (null = todas). Sin alcance explícito no se devuelve nada. */
export function sitesForBriefing(scope?: Scope): string[] | null {
  return scope ? siteIdsForScope(scope) : [];
}

const inSites = (allowed: string[] | null, site: string | null | undefined) =>
  !allowed || (site != null && allowed.includes(site));

function templateBriefing(day: string, siteId: string | undefined, scope?: Scope): BriefingBullet[] {
  const allowed = sitesForBriefing(scope);
  const report = reportForDay({ day, siteId, scope });
  const punches = listPunches({
    siteId,
    ...dayBoundsUtc(day),
    limit: 500,
  }).filter((p) => inSites(allowed, p.siteId));
  const pins = punches.filter((p) => p.method === "supervisor_pin");
  const anomalies = listAnomalies({ day, siteId }).filter((a) => inSites(allowed, a.siteId));
  const late = report.rows.filter((r) => r.status === "late");
  const absent = report.rows.filter((r) => r.status === "absent");
  const corrections = (listCorrections(undefined, allowed) as Array<Record<string, unknown>>).filter((c) =>
    String(c.created_at || "").startsWith(day),
  );
  const offline = report.terminals.filter((t) => !t.online);
  const siteQ = siteId || "";

  const lateCite = late
    .slice(0, 3)
    .flatMap((r) => {
      const cites: BriefingBullet["cites"] = [{ type: "employee", id: r.employee.id }];
      if (r.lastPunch) cites.push({ type: "punch", id: r.lastPunch.id });
      return cites;
    });

  return [
    {
      text: `${day}: ${report.totals.present} presentes, ${report.totals.late} tardes, ${report.totals.absent} ausentes, ${report.totals.omission} omisiones (${report.rows.length} colaboradores en el filtro).`,
      href: `/reports?${qs({ day, site: siteQ })}`,
      cites: punches.slice(0, 5).map((p) => ({ type: "punch" as const, id: p.id })),
    },
    {
      text:
        late.length === 0
          ? `Sin atrasos registrados en el filtro.`
          : `Tardes: ${late
              .slice(0, 3)
              .map((r) => `${r.employee.name} (${r.employee.id}, +${r.lateMin} min)`)
              .join("; ")}${late.length > 3 ? "…" : ""}.`,
      href: `/reports?${qs({ day, site: siteQ, status: "late" })}`,
      cites: lateCite,
    },
    {
      text:
        absent.length === 0
          ? `Nadie figura ausente en el filtro.`
          : `Ausentes: ${absent
              .slice(0, 4)
              .map((r) => `${r.employee.name} (${r.employee.id})`)
              .join("; ")}.`,
      href: `/reports?${qs({ day, site: siteQ, status: "absent" })}`,
      cites: absent.slice(0, 4).map((r) => ({ type: "employee" as const, id: r.employee.id })),
    },
    {
      text:
        offline.length === 0
          ? `Terminales en línea: ${report.terminals.length}.`
          : `${offline.length} terminal(es) en silencio: ${offline.map((t) => t.id).join(", ")}.`,
      href: "/admin",
      cites: offline.map((t) => ({ type: "terminal" as const, id: t.id })),
    },
    {
      text: `PIN supervisor: ${pins.length} · anomalías abiertas: ${anomalies.filter((a) => !a.reviewed).length} · correcciones del día: ${corrections.length}.`,
      href: `/reports?${qs({ day, site: siteQ })}`,
      cites: [
        ...pins.slice(0, 3).map((p) => ({ type: "punch" as const, id: p.id })),
        ...anomalies.slice(0, 2).map((a) => ({ type: "anomaly" as const, id: a.id })),
      ],
    },
  ];
}

function factsPayload(day: string, siteId?: string, scope?: Scope) {
  const allowed = sitesForBriefing(scope);
  const report = reportForDay({ day, siteId, scope });
  const punches = listPunches({
    siteId,
    ...dayBoundsUtc(day),
    limit: 200,
  }).filter((p) => inSites(allowed, p.siteId));
  return {
    day,
    siteId: siteId ?? null,
    totals: report.totals,
    rows: report.rows.map((r) => ({
      employeeId: r.employee.id,
      name: r.employee.name,
      code: r.employee.code,
      status: r.status,
      lateMin: r.lateMin,
      lastPunchId: r.lastPunch?.id ?? null,
    })),
    terminals: report.terminals.map((t) => ({
      id: t.id,
      label: t.label,
      online: t.online,
    })),
    pinPunchIds: punches.filter((p) => p.method === "supervisor_pin").map((p) => p.id),
    anomalies: listAnomalies({ day, siteId }).filter((a) => inSites(allowed, a.siteId)).map((a) => ({
      id: a.id,
      kind: a.kind,
      message: a.message,
      punchIds: a.punchIds,
      reviewed: a.reviewed,
    })),
  };
}

export async function generateBriefing(input: { day?: string; siteId?: string; scope?: Scope }): Promise<Briefing> {
  const day = input.day || todayLocal();
  const siteId = input.siteId;
  const fallback = templateBriefing(day, siteId, input.scope);
  const info = llmInfo();
  getDb();
  if (info.provider === "none") {
    return { day, siteId: siteId ?? null, source: "template", provider: "none", bullets: fallback };
  }
  const facts = factsPayload(day, siteId, input.scope);
  const raw = await llmComplete(
    `Eres el briefing operativo de Reloj CR. Responde SOLO un JSON: {"bullets":[{"text":"...","href":"/reports?day=...","cites":[{"type":"punch|employee|terminal|anomaly","id":"..."}]}]} con EXACTAMENTE 5 bullets en español. Usa únicamente los hechos JSON del usuario. No inventes nombres, ids ni conteos. Cada bullet debe citar al menos un id real o un total del JSON. href debe ser una ruta interna /reports o /admin. No des consejos de sanción.`,
    JSON.stringify(facts),
  );
  if (!raw) {
    return { day, siteId: siteId ?? null, source: "template", provider: info.provider, bullets: fallback };
  }
  try {
    const parsed = JSON.parse(raw.replace(/^```json\s*|\s*```$/g, "")) as { bullets?: BriefingBullet[] };
    // La salida del modelo no es de confianza: enlaces solo internos, texto acotado.
    const bullets = (parsed.bullets || []).slice(0, 5).map((b) => ({
      text: String(b.text ?? "").slice(0, 400),
      href: SAFE_HREF.test(String(b.href ?? "")) ? String(b.href) : "/reports",
      cites: Array.isArray(b.cites)
        ? b.cites.filter((c) => c && typeof c.id === "string" && typeof c.type === "string").slice(0, 10)
        : [],
    }));
    if (bullets.length < 3) {
      return { day, siteId: siteId ?? null, source: "template", provider: info.provider, bullets: fallback };
    }
    return { day, siteId: siteId ?? null, source: "llm", provider: info.provider, bullets };
  } catch {
    return { day, siteId: siteId ?? null, source: "template", provider: info.provider, bullets: fallback };
  }
}
