// Horas trabajadas y límites de jornada a partir de marcaciones IN/OUT.
// Es una ayuda para detectar riesgos, no un concepto jurídico: los límites son
// configurables y deben validarse con un abogado laboral.

export type LaborPunch = { id: string; type: string; capturedAt: string };

export type LaborRules = {
  maxDailyHours: number;
  maxWeeklyHours: number;
  /** Días seguidos trabajados a partir de los cuales falta descanso. */
  restEveryDays: number;
};

// 42 h/semana vigentes desde julio de 2026 (Ley 2101/2021); 10 h/día = jornada + 2 extras.
export const DEFAULT_RULES: LaborRules = { maxDailyHours: 10, maxWeeklyHours: 42, restEveryDays: 7 };
// Tope legal de horas extras por semana.
export const WEEKLY_OVERTIME_CAP = 12;
// Un intervalo más largo es casi seguro una salida olvidada, no un turno real.
const MAX_INTERVAL_MS = 16 * 3600_000;

export type Finding = {
  kind: "daily_limit" | "weekly_limit" | "no_rest";
  date: string;
  hours: number;
  message: string;
};

export type LaborAnalysis = {
  days: Array<{ date: string; hours: number }>;
  weeks: Array<{ weekStart: string; hours: number }>;
  orphans: number;
  findings: Finding[];
};

export function localDate(iso: string, tz: string) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(new Date(iso));
}

function addDays(date: string, delta: number) {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}

function weekStart(date: string) {
  const weekday = new Date(`${date}T12:00:00Z`).getUTCDay();
  return addDays(date, -((weekday + 6) % 7));
}

const round = (n: number) => Math.round(n * 100) / 100;

/** Empareja cada IN con la siguiente OUT. Un IN sin OUT (o al revés) no suma horas. */
export function workedIntervals(punches: LaborPunch[]) {
  const sorted = [...punches].sort((a, b) => a.capturedAt.localeCompare(b.capturedAt));
  const intervals: Array<{ start: string; end: string; ms: number }> = [];
  let orphans = 0;
  let open: LaborPunch | null = null;
  for (const p of sorted) {
    if (p.type === "IN") {
      if (open) orphans += 1;
      open = p;
    } else if (p.type === "OUT") {
      if (!open) {
        orphans += 1;
        continue;
      }
      const ms = new Date(p.capturedAt).getTime() - new Date(open.capturedAt).getTime();
      if (ms > 0 && ms <= MAX_INTERVAL_MS) intervals.push({ start: open.capturedAt, end: p.capturedAt, ms });
      else orphans += 1;
      open = null;
    }
  }
  if (open) orphans += 1;
  return { intervals, orphans };
}

export function analyzeLabor(
  punches: LaborPunch[],
  tz: string,
  rules: LaborRules = DEFAULT_RULES,
): LaborAnalysis {
  const { intervals, orphans } = workedIntervals(punches);
  // ponytail: un turno que cruza medianoche se cuenta completo en el día en que empezó.
  const perDay = new Map<string, number>();
  for (const i of intervals) {
    const day = localDate(i.start, tz);
    perDay.set(day, (perDay.get(day) ?? 0) + i.ms / 3600_000);
  }
  const days = [...perDay].sort(([a], [b]) => a.localeCompare(b)).map(([date, h]) => ({ date, hours: round(h) }));

  const perWeek = new Map<string, number>();
  for (const d of days) {
    const w = weekStart(d.date);
    perWeek.set(w, (perWeek.get(w) ?? 0) + d.hours);
  }
  const weeks = [...perWeek].map(([week, hours]) => ({ weekStart: week, hours: round(hours) }));

  const findings: Finding[] = [];
  for (const d of days) {
    if (d.hours > rules.maxDailyHours) {
      findings.push({
        kind: "daily_limit",
        date: d.date,
        hours: d.hours,
        message: `${d.date}: ${d.hours} h trabajadas, supera el máximo diario de ${rules.maxDailyHours} h.`,
      });
    }
  }
  for (const w of weeks) {
    if (w.hours > rules.maxWeeklyHours) {
      const extra = round(w.hours - rules.maxWeeklyHours);
      findings.push({
        kind: "weekly_limit",
        date: w.weekStart,
        hours: w.hours,
        message:
          `Semana del ${w.weekStart}: ${w.hours} h, ${extra} h sobre el límite de ${rules.maxWeeklyHours} h` +
          (extra > WEEKLY_OVERTIME_CAP ? ` (supera el tope de ${WEEKLY_OVERTIME_CAP} h extras semanales).` : "."),
      });
    }
  }
  let runStart: string | null = null;
  let runLen = 0;
  const close = () => {
    if (runStart && runLen >= rules.restEveryDays) {
      findings.push({
        kind: "no_rest",
        date: runStart,
        hours: runLen,
        message: `${runLen} días seguidos con trabajo desde el ${runStart}, sin día de descanso.`,
      });
    }
  };
  let prev: string | null = null;
  for (const d of days) {
    if (prev && addDays(prev, 1) === d.date) {
      runLen += 1;
    } else {
      close();
      runStart = d.date;
      runLen = 1;
    }
    prev = d.date;
  }
  close();
  return { days, weeks, orphans, findings };
}
