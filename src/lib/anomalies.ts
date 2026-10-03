import { ulid } from "ulidx";
import { getDb, listEmployees, listPunches, listSites, listTerminals, recordEvent } from "@/lib/db";
import { laborRules, reportForDay, todayLocal } from "@/lib/db-ops";
import { analyzeLabor } from "@/lib/labor";
import { TIMEZONE, dayBoundsUtc, localNoon } from "@/lib/config";

export type AnomalyRow = {
  id: string;
  kind: string;
  siteId: string | null;
  employeeId: string | null;
  day: string;
  message: string;
  punchIds: string[];
  evidence: Record<string, unknown>;
  reviewed: boolean;
  reviewedBy: string | null;
  createdAt: string;
};

function mapAnomaly(row: Record<string, unknown>): AnomalyRow {
  return {
    id: String(row.id),
    kind: String(row.kind),
    siteId: row.site_id ? String(row.site_id) : null,
    employeeId: row.employee_id ? String(row.employee_id) : null,
    day: String(row.day),
    message: String(row.message),
    punchIds: JSON.parse(String(row.punch_ids || "[]")) as string[],
    evidence: JSON.parse(String(row.evidence || "{}")) as Record<string, unknown>,
    reviewed: Boolean(row.reviewed),
    reviewedBy: row.reviewed_by ? String(row.reviewed_by) : null,
    createdAt: String(row.created_at),
  };
}

export function listAnomalies(filters?: { day?: string; siteId?: string; reviewed?: boolean }) {
  const clauses: string[] = [];
  const params: unknown[] = [];
  if (filters?.day) {
    clauses.push("day = ?");
    params.push(filters.day);
  }
  if (filters?.siteId) {
    clauses.push("site_id = ?");
    params.push(filters.siteId);
  }
  if (filters?.reviewed === true) {
    clauses.push("reviewed = 1");
  } else if (filters?.reviewed === false) {
    clauses.push("reviewed = 0");
  }
  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  const rows = getDb()
    .prepare(`SELECT * FROM anomalies ${where} ORDER BY created_at DESC LIMIT 200`)
    .all(...params) as Record<string, unknown>[];
  return rows.map(mapAnomaly);
}

function upsertAnomaly(input: {
  kind: string;
  siteId: string | null;
  employeeId?: string | null;
  day: string;
  message: string;
  punchIds: string[];
  evidence: Record<string, unknown>;
}) {
  const db = getDb();
  const existing = db
    .prepare("SELECT * FROM anomalies WHERE kind = ? AND ifnull(site_id,'') = ifnull(?,'') AND day = ?")
    .get(input.kind, input.siteId, input.day) as Record<string, unknown> | undefined;
  if (existing) {
    if (!existing.reviewed) {
      db.prepare("UPDATE anomalies SET message = ?, punch_ids = ?, evidence = ?, employee_id = ? WHERE id = ?").run(
        input.message,
        JSON.stringify(input.punchIds),
        JSON.stringify(input.evidence),
        input.employeeId ?? null,
        existing.id,
      );
    }
    return {
      row: mapAnomaly({
        ...existing,
        ...input,
        // mapAnomaly espera texto JSON, no los objetos que llegan en `input`.
        punch_ids: JSON.stringify(input.punchIds),
        evidence: JSON.stringify(input.evidence),
      }),
      created: false,
    };
  }
  const id = ulid();
  db.prepare(
    `INSERT INTO anomalies (id, kind, site_id, employee_id, day, message, punch_ids, evidence, reviewed, reviewed_by, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, NULL, ?)`,
  ).run(
    id,
    input.kind,
    input.siteId,
    input.employeeId ?? null,
    input.day,
    input.message,
    JSON.stringify(input.punchIds),
    JSON.stringify(input.evidence),
    new Date().toISOString(),
  );
  recordEvent(db, "anomaly.detected", {
    id,
    kind: input.kind,
    siteId: input.siteId,
    day: input.day,
    message: input.message,
    punchIds: input.punchIds,
  });
  return { row: listAnomalies().find((a) => a.id === id)!, created: true };
}

function shiftDay(day: string, delta: number) {
  const d = new Date(localNoon(day));
  d.setDate(d.getDate() + delta);
  return new Intl.DateTimeFormat("en-CA", { timeZone: TIMEZONE }).format(d);
}

export function scanAnomalies(day?: string) {
  const d = day || todayLocal();
  const { from, to } = dayBoundsUtc(d);
  const hour = Number(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: TIMEZONE,
      hour: "2-digit",
      hour12: false,
    }).format(new Date()),
  );
  const created: AnomalyRow[] = [];
  const updated: AnomalyRow[] = [];

  for (const site of listSites()) {
    const punches = listPunches({ siteId: site.id, from, to, limit: 500 });
    const pins = punches.filter((p) => p.method === "supervisor_pin");
    if (pins.length >= 2) {
      const r = upsertAnomaly({
        kind: "pin_fallback_spike",
        siteId: site.id,
        day: d,
        message: `${pins.length} marcaciones por PIN de supervisor en ${site.name} (${d}). Posible buddy-punch o kiosco degradado.`,
        punchIds: pins.map((p) => p.id),
        evidence: {
          count: pins.length,
          employeeIds: [...new Set(pins.map((p) => p.employeeId).filter(Boolean))],
        },
      });
      (r.created ? created : updated).push(r.row);
    }

    const matched = [...punches]
      .filter((p) => p.decision === "matched" && p.employeeId)
      .sort((a, b) => a.capturedAt.localeCompare(b.capturedAt));
    const buddyIds: string[] = [];
    const pairs: Array<{ a: string; b: string; ms: number }> = [];
    for (let i = 0; i < matched.length - 1; i += 1) {
      const a = matched[i];
      const b = matched[i + 1];
      if (a.terminalId !== b.terminalId || a.employeeId === b.employeeId) continue;
      const ms = Math.abs(new Date(b.capturedAt).getTime() - new Date(a.capturedAt).getTime());
      if (ms <= 20_000) {
        buddyIds.push(a.id, b.id);
        pairs.push({ a: a.employeeId!, b: b.employeeId!, ms });
      }
    }
    if (pairs.length >= 1) {
      const r = upsertAnomaly({
        kind: "buddy_punch",
        siteId: site.id,
        day: d,
        message: `${pairs.length} pares de marcaciones <20 s en el mismo terminal de ${site.name}. Revisar, no sancionar desde aquí.`,
        punchIds: [...new Set(buddyIds)],
        evidence: { pairs },
      });
      (r.created ? created : updated).push(r.row);
    }

    const terminals = listTerminals().filter((t) => t.siteId === site.id);
    const failish = punches.filter(
      (p) => p.decision === "unknown" || p.decision === "no_face" || p.livenessHint === "fail",
    );
    const failRate = punches.length ? failish.length / punches.length : 0;
    const peak = hour >= 7 && hour <= 10;
    const offlinePeak = terminals.some((t) => !t.online) && peak;
    if ((punches.length >= 4 && failRate >= 0.4) || offlinePeak) {
      const r = upsertAnomaly({
        kind: "degraded_terminal",
        siteId: site.id,
        day: d,
        message: offlinePeak
          ? `Terminal en silencio en hora pico (07–10) en ${site.name}.`
          : `${Math.round(failRate * 100)} % de fallos biométricos (${failish.length}/${punches.length}) en ${site.name}.`,
        punchIds: failish.map((p) => p.id),
        evidence: {
          failRate,
          offline: terminals.filter((t) => !t.online).map((t) => t.id),
          peak,
        },
      });
      (r.created ? created : updated).push(r.row);
    }

    // Límites de jornada: se mira desde dos semanas atrás para tener semanas completas y rachas.
    const windowStart = dayBoundsUtc(shiftDay(d, -13)).from;
    const recentFrom = shiftDay(d, -6);
    const history = listPunches({ siteId: site.id, from: windowStart, to, order: "asc", limit: 5000 });
    const rules = laborRules();
    const over: Array<{ employeeId: string; name: string; findings: string[] }> = [];
    for (const emp of listEmployees(site.id)) {
      const mine = history.filter(
        (p) => p.employeeId === emp.id && (p.decision === "matched" || p.decision === "queued"),
      );
      if (!mine.length) continue;
      const findings = analyzeLabor(mine, TIMEZONE, rules).findings.filter((f) => f.date >= recentFrom);
      if (findings.length) over.push({ employeeId: emp.id, name: emp.name, findings: findings.map((f) => f.message) });
    }
    if (over.length) {
      const names = over.slice(0, 3).map((o) => o.name).join(", ");
      const r = upsertAnomaly({
        kind: "labor_limits",
        siteId: site.id,
        day: d,
        message: `${over.length} trabajador(es) superan límites de jornada en ${site.name}: ${names}${over.length > 3 ? "…" : ""}. Revisar el expediente antes de decidir nada.`,
        punchIds: [],
        evidence: { rules, workers: over },
      });
      (r.created ? created : updated).push(r.row);
    }

    const todayRep = reportForDay({ day: d, siteId: site.id });
    const omissions = todayRep.totals.omission;
    let baseSum = 0;
    let baseN = 0;
    for (let i = 1; i <= 7; i += 1) {
      const prev = reportForDay({ day: shiftDay(d, -i), siteId: site.id });
      baseSum += prev.totals.omission;
      baseN += 1;
    }
    const baseline = baseN ? baseSum / baseN : 0;
    if (omissions >= 2 && omissions > baseline + 1) {
      const omitted = todayRep.rows.filter((r) => r.status === "omission");
      const r = upsertAnomaly({
        kind: "omission_spike",
        siteId: site.id,
        day: d,
        message: `${omissions} omisiones de salida en ${site.name} (baseline 7d: ${baseline.toFixed(1)}).`,
        punchIds: omitted
          .map((row) => row.lastPunch?.id)
          .filter((id): id is string => Boolean(id)),
        evidence: {
          omissions,
          baseline,
          employeeIds: omitted.map((row) => row.employee.id),
        },
      });
      (r.created ? created : updated).push(r.row);
    }
  }

  return { day: d, created: created.length, updated: updated.length, anomalies: listAnomalies({ day: d }) };
}

/** Una anomalía por id, sin el tope de 200 de `listAnomalies`. */
export function getAnomaly(id: string) {
  const row = getDb().prepare("SELECT * FROM anomalies WHERE id = ?").get(id) as
    | Record<string, unknown>
    | undefined;
  return row ? mapAnomaly(row) : null;
}

export function reviewAnomaly(id: string, reviewer: string) {
  const db = getDb();
  const row = db.prepare("SELECT * FROM anomalies WHERE id = ?").get(id) as Record<string, unknown> | undefined;
  if (!row) return null;
  db.prepare("UPDATE anomalies SET reviewed = 1, reviewed_by = ? WHERE id = ?").run(reviewer, id);
  recordEvent(db, "anomaly.reviewed", { id, reviewer });
  return mapAnomaly({ ...row, reviewed: 1, reviewed_by: reviewer });
}
