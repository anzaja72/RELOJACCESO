// Cálculo de horas trabajadas y valores: ordinarias vs extra (diurna/nocturna/festiva).
import type { Punch } from "./types";
import { dayBoundsUtc, TIMEZONE, UTC_OFFSET } from "./config.ts";
import { hoursToPay, LEGAL_DEFAULTS } from "./payroll-co.ts";

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
  surchargeHours: number;
  hourlyRate: number;
  /** Sueldo base del contrato: solo referencia, no es parte de `totalValue`. */
  ordinaryValue: number;
  surchargeValue: number;
  extraDayValue: number;
  extraNightValue: number;
  extraHolidayValue: number;
  absenceDays: number;
  absenceDiscount: number;
  /** Recargos y extras menos el descuento por ausencias injustificadas. */
  totalValue: number;
  weeklyHours: Record<string, number>;
  byCategory: { hours: Record<string, number>; values: Record<string, number> };
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
  const d = new Date(`${day}T12:00:00${UTC_OFFSET}`);
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
  const d = new Date(`${day}T12:00:00${UTC_OFFSET}`);
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

/** Duración pagada de la jornada que empieza en `day` (un turno nocturno se cuenta completo ese día). */
function shiftMinFor(day: string, scheduleFor: (d: string) => DaySchedule | null): number {
  const sched = scheduleFor(day);
  if (!sched) return 0;
  const span = sched.endMin > sched.startMin ? sched.endMin - sched.startMin : 1440 - sched.startMin + sched.endMin;
  return Math.max(0, span - sched.breakMin);
}

/** Resumen mensual por trabajador: horas por categoría y lo que el registro agrega o quita al sueldo. */
export function summarizeMonth(input: {
  month: string;
  punches: Punch[];
  scheduleFor: (day: string) => DaySchedule | null;
  contract: { monthlySalary: number; weeklyHours: number } | null;
  cfg: PayCfg;
  unjustifiedAbsenceDays?: number;
}): MonthPayroll {
  const { month, cfg, scheduleFor } = input;
  const intervals = cappedIntervals(workedIntervals(input.punches), scheduleFor);
  const pay = hoursToPay(
    {
      month,
      intervals,
      plannedMinFor: (day) => shiftMinFor(day, scheduleFor),
      monthlySalary: input.contract?.monthlySalary ?? 0,
      weeklyHours: input.contract?.weeklyHours ?? 0,
      unjustifiedAbsenceDays: input.unjustifiedAbsenceDays,
    },
    {
      ...LEGAL_DEFAULTS,
      extraDiurna: Math.max(0, cfg.multDay - 1),
      extraNocturna: Math.max(0, cfg.multNight - 1),
      nocturnaInicio: [{ from: "0000-01-01", value: cfg.nightStartMin }],
      nocturnaFin: cfg.nightEndMin,
      extraHolidays: cfg.holidays,
      offsetMin: -300,
    },
  );
  const weeklyHours: Record<string, number> = {};
  for (const [day, min] of Object.entries(pay.minutesByDay)) {
    const wk = weekKey(day);
    weeklyHours[wk] = Math.round(((weeklyHours[wk] || 0) + min / 60) * 100) / 100;
  }
  const h = pay.hours;
  const v = pay.values;
  const sum = (o: Record<string, number>, keys: string[]) => keys.reduce((s, k) => s + o[k], 0);
  const r2 = (n: number) => Math.round(n * 100) / 100;
  return {
    workedHours: pay.workedHours,
    ordinaryHours: r2(sum(h, ["ord_dia", "ord_noche", "ord_dom_dia", "ord_dom_noche"])),
    extraDayHours: h.ext_dia,
    extraNightHours: h.ext_noche,
    extraHolidayHours: r2(h.ext_dom_dia + h.ext_dom_noche),
    surchargeHours: r2(sum(h, ["ord_noche", "ord_dom_dia", "ord_dom_noche"])),
    hourlyRate: pay.hourlyRate,
    ordinaryValue: pay.baseSalary,
    surchargeValue: sum(v, ["ord_noche", "ord_dom_dia", "ord_dom_noche"]),
    extraDayValue: v.ext_dia,
    extraNightValue: v.ext_noche,
    extraHolidayValue: v.ext_dom_dia + v.ext_dom_noche,
    absenceDays: pay.absenceDays,
    absenceDiscount: pay.absenceDiscount,
    totalValue: pay.toPay,
    weeklyHours,
    byCategory: { hours: h, values: v },
  };
}
