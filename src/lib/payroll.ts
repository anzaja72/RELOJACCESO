// Cálculo de horas trabajadas y valores: ordinarias vs extra (diurna/nocturna/festiva).
import type { Punch } from "./types";
import { dayBoundsUtc, TIMEZONE } from "./config.ts";

export type DaySchedule = { startMin: number; endMin: number; breakMin: number };

export type PayCfg = {
  holidays: string[];
  nightStartMin: number;
  nightEndMin: number;
  multDay: number;
  multNight: number;
  multHoliday: number;
};

export type MonthPayroll = {
  workedHours: number;
  ordinaryHours: number;
  extraDayHours: number;
  extraNightHours: number;
  extraHolidayHours: number;
  hourlyRate: number;
  ordinaryValue: number;
  extraDayValue: number;
  extraNightValue: number;
  extraHolidayValue: number;
  totalValue: number;
  weeklyHours: Record<string, number>;
};

export function hmToMin(hm: string) {
  const [h, m] = hm.split(":").map(Number);
  return h * 60 + m;
}

function localSec(iso: string): number {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: TIMEZONE,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  })
    .format(new Date(iso))
    .split(":")
    .map(Number);
  return parts[0] * 3600 + parts[1] * 60 + parts[2];
}

function localDayOf(iso: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TIMEZONE }).format(new Date(iso));
}

function weekKey(day: string): string {
  const d = new Date(`${day}T12:00:00-05:00`);
  const dow = (d.getDay() + 6) % 7; // lunes = 0
  d.setDate(d.getDate() - dow);
  return new Intl.DateTimeFormat("en-CA", { timeZone: TIMEZONE }).format(d);
}

/** Agrupa el flujo de punches en intervalos [IN..OUT], descontando descansos. Sin filtro de día: un turno nocturno cruza medianoche. */
export function workedIntervals(punches: Punch[]): Array<{ from: string; to: string | null }> {
  const sorted = [...punches]
    .filter((p) => p.decision === "matched" || p.decision === "queued")
    .filter((p) => p.type === "IN" || p.type === "OUT" || p.type === "BREAK_START" || p.type === "BREAK_END")
    .map((p) => ({ ...p, capturedAt: new Date(p.capturedAt).toISOString() }))
    .sort((a, b) => a.capturedAt.localeCompare(b.capturedAt));
  const out: Array<{ from: string; to: string | null }> = [];
  let start: string | null = null;
  let breakStart: string | null = null;
  for (const p of sorted) {
    if (p.type === "IN") {
      if (start) out.push({ from: start, to: p.capturedAt });
      start = p.capturedAt;
      breakStart = null;
    } else if (p.type === "BREAK_START" && start && !breakStart) {
      out.push({ from: start, to: p.capturedAt });
      start = null;
      breakStart = p.capturedAt;
    } else if (p.type === "BREAK_END" && breakStart) {
      start = p.capturedAt;
      breakStart = null;
    } else if (p.type === "OUT") {
      if (start) {
        out.push({ from: start, to: p.capturedAt });
        start = null;
        breakStart = null;
      }
      breakStart = null;
    }
  }
  if (start) out.push({ from: start, to: null });
  return out;
}

/** Cierra intervalos abiertos (sin OUT): hasta el fin de jornada programado; si no hay jornada, hasta el fin del día local. */
function cappedIntervals(
  intervals: Array<{ from: string; to: string | null }>,
  scheduleFor: (day: string) => DaySchedule | null,
): Array<{ from: string; to: string }> {
  return intervals.map((iv) => {
    if (iv.to) return { from: iv.from, to: iv.to };
    const day = localDayOf(iv.from);
    const sched = scheduleFor(day);
    const { from: dayStart, to: dayEnd } = dayBoundsUtc(day);
    if (!sched) return { from: iv.from, to: dayEnd };
    let capMs = new Date(dayStart).getTime() + sched.endMin * 60_000;
    // Turno nocturno (end antes que start): el corte es al día siguiente.
    if (sched.endMin < sched.startMin && localSec(iv.from) >= sched.startMin * 60) {
      capMs += 86_400_000;
    }
    const cap = new Date(capMs).toISOString();
    return { from: iv.from, to: cap > iv.from ? cap : dayEnd };
  });
}

/** Minutos trabajados en un día local + segundo local del fin de la jornada (para segmentar extras). */
export function dayTotals(
  day: string,
  intervals: Array<{ from: string; to: string }>,
): { workedMin: number; endSec: number } {
  const { from: dayStart, to: dayEnd } = dayBoundsUtc(day);
  let workedSec = 0;
  let endSec = 0;
  for (const iv of intervals) {
    const a = iv.from > dayStart ? iv.from : dayStart;
    const b = iv.to < dayEnd ? iv.to : dayEnd;
    if (b <= a) continue;
    workedSec += localSec(b) - localSec(a);
    const e = localSec(b);
    if (e > endSec) endSec = e;
  }
  // ponytail: redondeo a segundo completo (≈0.017 min por tramo que toca el borde del día).
  return { workedMin: workedSec / 60, endSec };
}

function overlap(a: number, b: number, s: number, e: number): number {
  return Math.max(0, Math.min(b, e) - Math.max(a, s));
}

/** Minutos dentro de la ventana nocturna [ns, ne) (puede cruzar medianoche) para el tramo [a,b] en minutos locales. */
function nightMinutes(a: number, b: number, ns: number, ne: number): number {
  if (ns < ne) return overlap(a, b, ns, ne);
  return overlap(a, b, ns, 1440) + overlap(a, b, 0, ne);
}

export function daysOfMonth(month: string): string[] {
  const [y, m] = month.split("-").map(Number);
  const n = new Date(y, m, 0).getDate();
  return Array.from({ length: n }, (_, i) => `${month}-${String(i + 1).padStart(2, "0")}`);
}

function prevDay(day: string): string {
  const d = new Date(`${day}T12:00:00-05:00`);
  d.setDate(d.getDate() - 1);
  return new Intl.DateTimeFormat("en-CA", { timeZone: TIMEZONE }).format(d);
}

/** Minutos planificados de un día: jornada propia + segunda parte (madrugada) de un turno nocturno iniciado ayer. */
function plannedMinFor(day: string, scheduleFor: (d: string) => DaySchedule | null): number {
  const sched = scheduleFor(day);
  let planned = 0;
  if (sched) {
    planned +=
      sched.endMin > sched.startMin
        ? Math.max(0, sched.endMin - sched.startMin - sched.breakMin)
        : Math.max(0, 1440 - sched.startMin - sched.breakMin);
  }
  const prev = scheduleFor(prevDay(day));
  if (prev && prev.endMin < prev.startMin) planned += prev.endMin;
  return planned;
}

/** Resumen mensual por trabajador: horas ordinarias y extra por tipo, más valores. */
export function summarizeMonth(input: {
  month: string;
  punches: Punch[];
  scheduleFor: (day: string) => DaySchedule | null;
  contract: { monthlySalary: number; weeklyHours: number } | null;
  cfg: PayCfg;
}): MonthPayroll {
  const { month, cfg, scheduleFor } = input;
  const intervals = cappedIntervals(workedIntervals(input.punches), scheduleFor);
  const rate =
    input.contract && input.contract.weeklyHours > 0
      ? input.contract.monthlySalary / (input.contract.weeklyHours * 4.33)
      : 0;
  const acc: MonthPayroll = {
    workedHours: 0,
    ordinaryHours: 0,
    extraDayHours: 0,
    extraNightHours: 0,
    extraHolidayHours: 0,
    hourlyRate: rate,
    ordinaryValue: 0,
    extraDayValue: 0,
    extraNightValue: 0,
    extraHolidayValue: 0,
    totalValue: 0,
    weeklyHours: {},
  };
  for (const day of daysOfMonth(month)) {
    const { workedMin, endSec } = dayTotals(day, intervals);
    if (workedMin <= 0) continue;
    const planned = plannedMinFor(day, scheduleFor);
    const extraMin = Math.max(0, workedMin - planned);
    const ordinaryMin = workedMin - extraMin;
    let nightMin = 0;
    let holidayMin = 0;
    if (extraMin > 0) {
      if (cfg.holidays.includes(day)) {
        holidayMin = extraMin;
      } else {
        const segStart = (endSec - extraMin * 60) / 60;
        const segEnd = endSec / 60;
        nightMin = nightMinutes(segStart, segEnd, cfg.nightStartMin, cfg.nightEndMin);
      }
    }
    const dayExtra = extraMin - nightMin - holidayMin;
    acc.workedHours += workedMin / 60;
    acc.ordinaryHours += ordinaryMin / 60;
    acc.extraDayHours += dayExtra / 60;
    acc.extraNightHours += nightMin / 60;
    acc.extraHolidayHours += holidayMin / 60;
    const wk = weekKey(day);
    acc.weeklyHours[wk] = (acc.weeklyHours[wk] || 0) + workedMin / 60;
  }
  acc.ordinaryValue = round2(acc.ordinaryHours * rate);
  acc.extraDayValue = round2(acc.extraDayHours * rate * cfg.multDay);
  acc.extraNightValue = round2(acc.extraNightHours * rate * cfg.multNight);
  acc.extraHolidayValue = round2(acc.extraHolidayHours * rate * cfg.multHoliday);
  acc.totalValue = round2(acc.ordinaryValue + acc.extraDayValue + acc.extraNightValue + acc.extraHolidayValue);
  for (const k of [
    "workedHours",
    "ordinaryHours",
    "extraDayHours",
    "extraNightHours",
    "extraHolidayHours",
  ] as const) {
    acc[k] = Math.round(acc[k] * 100) / 100;
  }
  return acc;
}

function round2(n: number) {
  return Math.round(n * 100) / 100;
}
