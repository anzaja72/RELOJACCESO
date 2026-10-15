// Horas trabajadas → valor a pagar por lo que el registro de asistencia mueve (Colombia).
//
// Alcance deliberadamente corto: clasifica cada minuto trabajado y valora recargos y extras,
// y descuenta las ausencias injustificadas. NO calcula seguridad social, incapacidades,
// prestaciones ni retenciones: eso lo liquida el sistema de nómina que recibe este dato.
// El sueldo base se informa solo como referencia.
import { colombianHolidays, isSundayOrHoliday } from "./co-holidays.ts";

export type Dated<T> = Array<{ from: string; value: T }>;

export type HoursPayParams = {
  recargoNocturno: number;
  /** Porcentaje adicional de la hora extra (0,25 = 125 % del valor hora). */
  extraDiurna: number;
  extraNocturna: number;
  /** Recargo dominical o festivo por fecha de vigencia (Ley 2466 de 2025: sube por etapas). */
  dominical: Dated<number>;
  /** Minuto del día en que empieza la jornada nocturna, por fecha. */
  nocturnaInicio: Dated<number>;
  nocturnaFin: number;
  /** Festivos adicionales (fechas AAAA-MM-DD) además del calendario oficial. */
  extraHolidays: string[];
  /** Desfase local respecto de UTC en minutos (Colombia: -300). */
  offsetMin: number;
};

export const LEGAL_DEFAULTS: Omit<HoursPayParams, "extraHolidays" | "offsetMin"> = {
  recargoNocturno: 0.35,
  extraDiurna: 0.25,
  extraNocturna: 0.75,
  dominical: [
    { from: "0000-01-01", value: 0.75 },
    { from: "2025-07-01", value: 0.8 },
    { from: "2026-07-01", value: 0.9 },
    { from: "2027-07-01", value: 1.0 },
  ],
  nocturnaInicio: [
    { from: "0000-01-01", value: 21 * 60 },
    { from: "2025-12-25", value: 19 * 60 },
  ],
  nocturnaFin: 6 * 60,
};

export const BUCKETS = [
  "ord_dia",
  "ord_noche",
  "ord_dom_dia",
  "ord_dom_noche",
  "ext_dia",
  "ext_noche",
  "ext_dom_dia",
  "ext_dom_noche",
] as const;
export type Bucket = (typeof BUCKETS)[number];

export const BUCKET_LABEL: Record<Bucket, string> = {
  ord_dia: "Horas ordinarias diurnas",
  ord_noche: "Recargo nocturno (horas ordinarias)",
  ord_dom_dia: "Recargo dominical o festivo (horas ordinarias)",
  ord_dom_noche: "Recargo nocturno dominical o festivo",
  ext_dia: "Hora extra diurna",
  ext_noche: "Hora extra nocturna",
  ext_dom_dia: "Hora extra diurna dominical o festiva",
  ext_dom_noche: "Hora extra nocturna dominical o festiva",
};

export type HoursPayInput = {
  month: string;
  /** Intervalos efectivamente trabajados (UTC, ISO). Cuentan en el mes en que empiezan. */
  intervals: Array<{ from: string; to: string }>;
  /** Minutos de jornada ordinaria pactada (pagada) del día local AAAA-MM-DD. */
  plannedMinFor: (day: string) => number;
  monthlySalary: number;
  weeklyHours: number;
  /** Días de ausencia injustificada del mes (la justificada no descuenta). */
  unjustifiedAbsenceDays?: number;
};

export type HoursPay = {
  month: string;
  hours: Record<Bucket, number>;
  /** Valor adicional por categoría: lo que se suma al sueldo (la hora ordinaria diurna vale 0). */
  values: Record<Bucket, number>;
  workedHours: number;
  hourlyRate: number;
  /** Minutos trabajados por día local, para totales semanales. */
  minutesByDay: Record<string, number>;
  baseSalary: number;
  absenceDays: number;
  absenceDiscount: number;
  /** Recargos y extras del mes. */
  additions: number;
  /** Lo que el registro de asistencia agrega o quita al sueldo: additions − absenceDiscount. */
  toPay: number;
  blockers: string[];
};

const MIN = 60_000;
const peso = (n: number) => Math.round(n + Number.EPSILON);
const pad = (n: number) => String(n).padStart(2, "0");

export function valueAt<T>(table: Dated<T>, date: string): T {
  let out = table[0].value;
  for (const row of table) if (row.from <= date) out = row.value;
  return out;
}

function localParts(ms: number, offsetMin: number) {
  const t = new Date(ms + offsetMin * MIN);
  return {
    date: `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`,
    minuteOfDay: t.getUTCHours() * 60 + t.getUTCMinutes(),
  };
}

export function hoursToPay(input: HoursPayInput, params: HoursPayParams): HoursPay {
  const blockers: string[] = [];
  if (!(input.monthlySalary > 0) || !(input.weeklyHours > 0)) {
    blockers.push("Sin salario u horas semanales en el contrato: no se puede valorar.");
  }
  const hourly = blockers.length ? 0 : input.monthlySalary / (input.weeklyHours * 5);
  const hours = Object.fromEntries(BUCKETS.map((b) => [b, 0])) as Record<Bucket, number>;
  const money = { ...hours };
  const minutesByDay: Record<string, number> = {};

  const holidayCache = new Map<number, Set<string>>();
  const isFestive = (date: string) => {
    const year = Number(date.slice(0, 4));
    let set = holidayCache.get(year);
    if (!set) {
      set = new Set([...colombianHolidays(year), ...params.extraHolidays]);
      holidayCache.set(year, set);
    }
    return isSundayOrHoliday(date, set);
  };

  // Cada turno se evalúa en el día local en que empieza; el cupo ordinario se consume en orden.
  const byDay = new Map<string, Array<{ from: number; to: number }>>();
  for (const iv of input.intervals) {
    const from = Date.parse(iv.from);
    const to = Date.parse(iv.to);
    if (!(to > from)) continue;
    const day = localParts(from, params.offsetMin).date;
    if (!day.startsWith(input.month)) continue;
    if (!byDay.has(day)) byDay.set(day, []);
    byDay.get(day)!.push({ from, to });
  }

  for (const [day, ivs] of byDay) {
    let plannedLeft = Math.max(0, input.plannedMinFor(day));
    const nightStart = valueAt(params.nocturnaInicio, day);
    for (const iv of ivs.sort((a, b) => a.from - b.from)) {
      for (let t = Math.floor(iv.from / MIN); t < Math.floor(iv.to / MIN); t += 1) {
        const p = localParts(t * MIN, params.offsetMin);
        const night = p.minuteOfDay >= nightStart || p.minuteOfDay < params.nocturnaFin;
        const festive = isFestive(p.date);
        const ordinary = plannedLeft > 0;
        if (ordinary) plannedLeft -= 1;
        const bucket = `${ordinary ? "ord" : "ext"}_${festive ? "dom_" : ""}${night ? "noche" : "dia"}` as Bucket;
        hours[bucket] += 1 / 60;
        minutesByDay[day] = (minutesByDay[day] ?? 0) + 1;
        const dom = valueAt(params.dominical, p.date);
        const mult: Record<Bucket, number> = {
          ord_dia: 0,
          ord_noche: params.recargoNocturno,
          ord_dom_dia: dom,
          ord_dom_noche: params.recargoNocturno + dom,
          ext_dia: 1 + params.extraDiurna,
          ext_noche: 1 + params.extraNocturna,
          ext_dom_dia: 1 + dom + params.extraDiurna,
          ext_dom_noche: 1 + dom + params.extraNocturna,
        };
        money[bucket] += (hourly / 60) * mult[bucket];
      }
    }
  }

  let workedHours = 0;
  let additions = 0;
  for (const b of BUCKETS) {
    workedHours += hours[b];
    additions += money[b];
    hours[b] = Math.round(hours[b] * 100) / 100;
    money[b] = peso(money[b]);
  }
  additions = peso(additions);
  const absenceDays = Math.max(0, input.unjustifiedAbsenceDays ?? 0);
  const absenceDiscount = peso((input.monthlySalary / 30) * absenceDays);
  return {
    month: input.month,
    hours,
    values: money,
    workedHours: Math.round(workedHours * 100) / 100,
    hourlyRate: Math.round(hourly * 100) / 100,
    minutesByDay,
    baseSalary: input.monthlySalary,
    absenceDays,
    absenceDiscount,
    additions,
    toPay: additions - absenceDiscount,
    blockers,
  };
}
