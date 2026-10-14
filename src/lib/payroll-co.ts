// Liquidación mensual de nómina para Colombia (trabajador dependiente, salario ordinario).
//
// Es una función pura: recibe tiempos, contrato, novedades y parámetros, y devuelve cada
// concepto con su base. Las reglas legales que cambian con el tiempo (recargo dominical,
// inicio de la jornada nocturna, jornada máxima) son tablas con fecha de vigencia.
// Los valores que fija el Gobierno cada año (SMMLV y auxilio de transporte) NO tienen
// valor por defecto: hay que cargarlos y el cálculo se detiene si faltan.
//
// Fuera de alcance (se informa en `warnings`): retención en la fuente, salario integral,
// liquidación final de contrato, pago de prestaciones y nómina electrónica.
import { colombianHolidays, isSundayOrHoliday } from "./co-holidays.ts";

export type Dated<T> = Array<{ from: string; value: T }>;

export type PayrollParams = {
  /** Salario mínimo mensual vigente del año liquidado. Obligatorio. */
  smmlv: number;
  /** Auxilio de transporte mensual vigente. Obligatorio. */
  auxTransporte: number;
  /** Empresa exonerada de salud/SENA/ICBF por debajo de 10 SMMLV (art. 114-1 del E.T.). */
  exonerada: boolean;
  /** Descontar el descanso dominical por una ausencia injustificada (criterio a definir con el abogado). */
  descuentaDominical: boolean;
  recargoNocturno: number;
  extraDiurna: number;
  extraNocturna: number;
  /** Recargo del trabajo dominical o festivo, por fecha de vigencia (reforma laboral, Ley 2466 de 2025). */
  dominical: Dated<number>;
  /** Hora en que empieza la jornada nocturna (minutos desde la medianoche), por fecha. */
  nocturnaInicio: Dated<number>;
  nocturnaFin: number;
  /** Jornada máxima semanal por fecha (Ley 2101 de 2021). */
  jornadaMaxima: Dated<number>;
  /** Desfase local respecto de UTC en minutos (Colombia: -300, sin horario de verano). */
  offsetMin: number;
};

/** Valores legales conocidos. SMMLV y auxilio de transporte se cargan aparte. */
export const LEGAL_DEFAULTS: Omit<PayrollParams, "smmlv" | "auxTransporte" | "offsetMin"> = {
  exonerada: true,
  descuentaDominical: false,
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
  jornadaMaxima: [
    { from: "0000-01-01", value: 48 },
    { from: "2023-07-15", value: 47 },
    { from: "2024-07-15", value: 46 },
    { from: "2025-07-15", value: 44 },
    { from: "2026-07-15", value: 42 },
  ],
};

export type NoveltyType =
  | "vacaciones"
  | "licencia_remunerada"
  | "licencia_luto"
  | "licencia_maternidad"
  | "licencia_paternidad"
  | "incapacidad_comun"
  | "incapacidad_laboral"
  | "licencia_no_remunerada"
  | "suspension"
  | "ausencia_injustificada";

/** Fracción del salario diario que paga el empleador (o recobra) por cada tipo de novedad. */
export const NOVELTY_PAY: Record<NoveltyType, { fraction: number; label: string; paidBy?: string }> = {
  vacaciones: { fraction: 1, label: "Vacaciones disfrutadas" },
  licencia_remunerada: { fraction: 1, label: "Licencia remunerada" },
  licencia_luto: { fraction: 1, label: "Licencia por luto" },
  licencia_maternidad: { fraction: 1, label: "Licencia de maternidad", paidBy: "EPS (recobro)" },
  licencia_paternidad: { fraction: 1, label: "Licencia de paternidad", paidBy: "EPS (recobro)" },
  incapacidad_comun: { fraction: 2 / 3, label: "Incapacidad por enfermedad general", paidBy: "EPS (recobro)" },
  incapacidad_laboral: { fraction: 1, label: "Incapacidad laboral", paidBy: "ARL (recobro)" },
  licencia_no_remunerada: { fraction: 0, label: "Licencia no remunerada" },
  suspension: { fraction: 0, label: "Suspensión del contrato" },
  ausencia_injustificada: { fraction: 0, label: "Ausencia injustificada" },
};

export type Novelty = { type: NoveltyType; from: string; to: string };

export type SalaryPoint = { from: string; monthlySalary: number; weeklyHours: number };

export type EmployeeInput = {
  employeeId: string;
  name?: string;
  /** Primer y último día del contrato (AAAA-MM-DD); null = sin límite. */
  contractStart: string | null;
  contractEnd: string | null;
  /** Historial ascendente por fecha de vigencia. */
  salaryHistory: SalaryPoint[];
  arlClass?: 1 | 2 | 3 | 4 | 5;
  /** Intervalos trabajados (UTC, ISO). Un descanso parte el intervalo en dos. */
  intervals: Array<{ from: string; to: string }>;
  /** Minutos de jornada ordinaria pactada para el día local AAAA-MM-DD. */
  plannedMinFor: (day: string) => number;
  novelties: Novelty[];
};

export type LineKind = "devengado" | "deduccion" | "aporte_empleador" | "provision";

export type Line = {
  code: string;
  label: string;
  kind: LineKind;
  amount: number;
  /** Cómo se llegó al valor, en palabras. */
  detail?: string;
  hours?: number;
};

export type Liquidation = {
  employeeId: string;
  month: string;
  lines: Line[];
  totals: {
    devengado: number;
    deducciones: number;
    neto: number;
    ibc: number;
    aportesEmpleador: number;
    provisiones: number;
    costoEmpleador: number;
  };
  hours: Record<string, number>;
  paidDays: number;
  warnings: string[];
  blockers: string[];
};

// ---------- utilidades de fecha y redondeo ----------
const MIN = 60_000;
const round0 = (n: number) => Math.round(n + Number.EPSILON);

/** Valor vigente en `date` de una tabla con fecha de inicio. */
export function valueAt<T>(table: Dated<T>, date: string): T {
  let out = table[0].value;
  for (const row of table) if (row.from <= date) out = row.value;
  return out;
}

const pad = (n: number) => String(n).padStart(2, "0");
const lastDay = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate();
const ymd = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`;

/** Días del mes calendario (AAAA-MM-DD). */
export function daysOfMonth(month: string): string[] {
  const [y, m] = month.split("-").map(Number);
  return Array.from({ length: lastDay(y, m) }, (_, i) => ymd(y, m, i + 1));
}

/**
 * Los 30 días comerciales de un mes: febrero y los meses de 31 días también pagan 30.
 * Devuelve, para cada día calendario, cuántos días comerciales le tocan (0 o 1; el 31 vale 0
 * y el último día de febrero vale lo que falta para llegar a 30).
 */
function commercialWeight(month: string): Map<string, number> {
  const days = daysOfMonth(month);
  const w = new Map<string, number>();
  const n = days.length;
  days.forEach((d, i) => {
    const day = i + 1;
    if (n === 31 && day === 31) w.set(d, 0);
    else if (n < 30 && day === n) w.set(d, 30 - (n - 1));
    else w.set(d, 1);
  });
  return w;
}

const inRange = (d: string, from: string, to: string) => d >= from && d <= to;

function localParts(ms: number, offsetMin: number) {
  const t = new Date(ms + offsetMin * MIN);
  return {
    date: ymd(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate()),
    minuteOfDay: t.getUTCHours() * 60 + t.getUTCMinutes(),
  };
}

// ---------- el cálculo ----------
const HOUR_BUCKETS = [
  "ord_dia",
  "ord_noche",
  "ord_dom_dia",
  "ord_dom_noche",
  "ext_dia",
  "ext_noche",
  "ext_dom_dia",
  "ext_dom_noche",
] as const;
type Bucket = (typeof HOUR_BUCKETS)[number];

const BUCKET_LABEL: Record<Bucket, string> = {
  ord_dia: "Horas ordinarias diurnas",
  ord_noche: "Recargo nocturno (horas ordinarias)",
  ord_dom_dia: "Recargo dominical o festivo (horas ordinarias)",
  ord_dom_noche: "Recargo nocturno dominical o festivo",
  ext_dia: "Hora extra diurna",
  ext_noche: "Hora extra nocturna",
  ext_dom_dia: "Hora extra diurna dominical o festiva",
  ext_dom_noche: "Hora extra nocturna dominical o festiva",
};

const ARL_RATE = { 1: 0.00522, 2: 0.01044, 3: 0.02436, 4: 0.0435, 5: 0.0696 } as const;

/** Tabla del fondo de solidaridad pensional, por múltiplos de SMMLV del IBC. */
function solidarityRate(ibcInSmmlv: number) {
  if (ibcInSmmlv < 4) return 0;
  if (ibcInSmmlv < 16) return 0.01;
  if (ibcInSmmlv < 17) return 0.012;
  if (ibcInSmmlv < 18) return 0.014;
  if (ibcInSmmlv < 19) return 0.016;
  if (ibcInSmmlv < 20) return 0.018;
  return 0.02;
}

export function paramsIssues(p: Partial<PayrollParams>): string[] {
  const out: string[] = [];
  if (!(Number(p.smmlv) > 0)) out.push("Falta el salario mínimo (SMMLV) vigente: cárguelo en los parámetros de nómina.");
  if (!(Number(p.auxTransporte) > 0)) out.push("Falta el auxilio de transporte vigente: cárguelo en los parámetros de nómina.");
  return out;
}

export function liquidateMonth(month: string, emp: EmployeeInput, params: PayrollParams): Liquidation {
  const blockers: string[] = [...paramsIssues(params)];
  const warnings: string[] = [
    "Retención en la fuente: no calculada (se informa en cero).",
  ];
  const days = daysOfMonth(month);
  const weight = commercialWeight(month);
  const empty: Liquidation = {
    employeeId: emp.employeeId,
    month,
    lines: [],
    totals: { devengado: 0, deducciones: 0, neto: 0, ibc: 0, aportesEmpleador: 0, provisiones: 0, costoEmpleador: 0 },
    hours: {},
    paidDays: 0,
    warnings,
    blockers,
  };
  if (!emp.salaryHistory.length) {
    blockers.push("No tiene contrato: falta el salario.");
    return empty;
  }
  if (blockers.length) return empty;

  const salaryOn = (day: string) => {
    let point = emp.salaryHistory[0];
    for (const p of emp.salaryHistory) if (p.from <= day) point = p;
    return point;
  };
  const inContract = (day: string) =>
    (!emp.contractStart || day >= emp.contractStart) && (!emp.contractEnd || day <= emp.contractEnd);
  const noveltyOn = (day: string) => emp.novelties.find((n) => inRange(day, n.from, n.to))?.type;

  // --- salario por día comercial, con novedades ---
  let salaryDays = 0;
  let salaryAmount = 0;
  let workedDays = 0; // días laborados: base del auxilio de transporte
  const novelty: Record<string, { days: number; amount: number }> = {};
  let underContractDays = 0;
  for (const day of days) {
    const wgt = weight.get(day) ?? 0;
    if (!inContract(day) || wgt === 0) continue;
    underContractDays += wgt;
    const daily = salaryOn(day).monthlySalary / 30;
    const type = noveltyOn(day);
    if (!type) {
      salaryDays += wgt;
      workedDays += wgt;
      salaryAmount += daily * wgt;
      continue;
    }
    const rule = NOVELTY_PAY[type];
    const slot = (novelty[type] ??= { days: 0, amount: 0 });
    slot.days += wgt;
    // La incapacidad nunca baja del salario mínimo diario.
    const floor = type === "incapacidad_comun" ? params.smmlv / 30 : 0;
    slot.amount += Math.max(daily * rule.fraction, rule.fraction > 0 ? floor : 0) * wgt;
  }

  const lines: Line[] = [];
  const add = (l: Line) => {
    if (l.amount !== 0 || l.kind === "deduccion") lines.push({ ...l, amount: round0(l.amount) });
  };

  add({
    code: "SAL",
    label: "Salario",
    kind: "devengado",
    amount: salaryAmount,
    detail: `${salaryDays} de 30 días`,
  });
  for (const [type, v] of Object.entries(novelty)) {
    const rule = NOVELTY_PAY[type as NoveltyType];
    add({
      code: `NOV_${type.toUpperCase()}`,
      label: rule.label,
      kind: "devengado",
      amount: v.amount,
      detail: `${v.days} días${rule.fraction > 0 && rule.fraction < 1 ? ` al ${Math.round(rule.fraction * 100)} %` : ""}${rule.paidBy ? ` · ${rule.paidBy}` : ""}`,
    });
  }
  if (novelty.ausencia_injustificada?.days && params.descuentaDominical) {
    warnings.push("Ausencia injustificada: el descuento del descanso dominical depende del criterio configurado; verifíquelo.");
  }

  // --- horas: ordinarias y extra, por categoría ---
  const hours: Record<Bucket, number> = Object.fromEntries(HOUR_BUCKETS.map((b) => [b, 0])) as Record<Bucket, number>;
  const money: Record<Bucket, number> = { ...hours };
  const sunday = (date: string, holidays: Set<string>) => isSundayOrHoliday(date, holidays);

  const byStartDay = new Map<string, Array<{ from: number; to: number }>>();
  for (const iv of emp.intervals) {
    const from = Date.parse(iv.from);
    const to = Date.parse(iv.to);
    if (!(to > from)) continue;
    const day = localParts(from, params.offsetMin).date;
    if (!day.startsWith(month)) continue; // el turno cuenta en el mes en que empieza
    if (!byStartDay.has(day)) byStartDay.set(day, []);
    byStartDay.get(day)!.push({ from, to });
  }

  const holidayCache = new Map<number, Set<string>>();
  const holidaysFor = (date: string) => {
    const year = Number(date.slice(0, 4));
    let set = holidayCache.get(year);
    if (!set) {
      set = new Set(colombianHolidays(year));
      holidayCache.set(year, set);
    }
    return set;
  };

  for (const [day, ivs] of [...byStartDay].sort(([a], [b]) => a.localeCompare(b))) {
    const sal = salaryOn(day);
    const hourly = sal.monthlySalary / (sal.weeklyHours * 5);
    let plannedLeft = Math.max(0, emp.plannedMinFor(day));
    const nightStart = valueAt(params.nocturnaInicio, day);
    for (const iv of ivs.sort((a, b) => a.from - b.from)) {
      const startMin = Math.floor(iv.from / MIN);
      const endMin = Math.floor(iv.to / MIN);
      for (let t = startMin; t < endMin; t += 1) {
        const p = localParts(t * MIN, params.offsetMin);
        const night = p.minuteOfDay >= nightStart || p.minuteOfDay < params.nocturnaFin;
        const dom = sunday(p.date, holidaysFor(p.date));
        const ordinary = plannedLeft > 0;
        if (ordinary) plannedLeft -= 1;
        const bucket: Bucket = ordinary
          ? dom
            ? night
              ? "ord_dom_noche"
              : "ord_dom_dia"
            : night
              ? "ord_noche"
              : "ord_dia"
          : dom
            ? night
              ? "ext_dom_noche"
              : "ext_dom_dia"
            : night
              ? "ext_noche"
              : "ext_dia";
        hours[bucket] += 1 / 60;
        const domPct = valueAt(params.dominical, p.date);
        const mult: Record<Bucket, number> = {
          ord_dia: 0,
          ord_noche: params.recargoNocturno,
          ord_dom_dia: domPct,
          ord_dom_noche: params.recargoNocturno + domPct,
          ext_dia: 1 + params.extraDiurna,
          ext_noche: 1 + params.extraNocturna,
          ext_dom_dia: 1 + domPct + params.extraDiurna,
          ext_dom_noche: 1 + domPct + params.extraNocturna,
        };
        money[bucket] += (hourly / 60) * mult[bucket];
        const max = valueAt(params.jornadaMaxima, day);
        if (sal.weeklyHours > max && !warnings.some((w) => w.startsWith("Jornada contractual"))) {
          warnings.push(`Jornada contractual de ${sal.weeklyHours} h/semana supera el máximo legal de ${max} h vigente.`);
        }
      }
    }
  }

  const outHours: Record<string, number> = {};
  for (const b of HOUR_BUCKETS) {
    outHours[b] = Math.round(hours[b] * 100) / 100;
    if (b === "ord_dia") continue;
    add({
      code: b.toUpperCase(),
      label: BUCKET_LABEL[b],
      kind: "devengado",
      amount: money[b],
      hours: outHours[b],
      detail: `${outHours[b]} h`,
    });
  }

  // --- auxilio de transporte ---
  const lastSalary = salaryOn(days[days.length - 1]).monthlySalary;
  const aux = lastSalary <= 2 * params.smmlv;
  if (aux) {
    add({
      code: "AUX",
      label: "Auxilio de transporte",
      kind: "devengado",
      amount: (params.auxTransporte / 30) * workedDays,
      detail: `${workedDays} de 30 días`,
    });
  }

  // --- IBC (base de seguridad social): salario + recargos + extras + vacaciones + incapacidades ---
  const devengadoSalarial = lines.filter((l) => l.kind === "devengado" && l.code !== "AUX").reduce((s, l) => s + l.amount, 0);
  const ibcMin = (params.smmlv / 30) * underContractDays;
  const ibcMax = 25 * params.smmlv;
  const ibc = Math.min(Math.max(devengadoSalarial, ibcMin), ibcMax);

  // --- deducciones del trabajador ---
  add({ code: "SALUD", label: "Salud (4 %)", kind: "deduccion", amount: ibc * 0.04, detail: `4 % de ${round0(ibc).toLocaleString("es-CO")}` });
  add({ code: "PENSION", label: "Pensión (4 %)", kind: "deduccion", amount: ibc * 0.04, detail: `4 % de ${round0(ibc).toLocaleString("es-CO")}` });
  const fsp = solidarityRate(ibc / params.smmlv);
  if (fsp > 0) {
    add({ code: "FSP", label: `Fondo de solidaridad pensional (${(fsp * 100).toFixed(1).replace(".", ",")} %)`, kind: "deduccion", amount: ibc * fsp });
  }

  // --- aportes del empleador y provisiones (informativos) ---
  const exo = params.exonerada && ibc < 10 * params.smmlv;
  const arl = emp.arlClass ?? 1;
  add({ code: "E_PENSION", label: "Pensión empleador (12 %)", kind: "aporte_empleador", amount: ibc * 0.12 });
  add({ code: "E_SALUD", label: "Salud empleador (8,5 %)", kind: "aporte_empleador", amount: exo ? 0 : ibc * 0.085, detail: exo ? "Exonerada (art. 114-1 E.T.)" : undefined });
  add({ code: "E_ARL", label: `ARL clase ${arl}`, kind: "aporte_empleador", amount: ibc * ARL_RATE[arl] });
  add({ code: "E_CAJA", label: "Caja de compensación (4 %)", kind: "aporte_empleador", amount: ibc * 0.04 });
  add({ code: "E_SENA", label: "SENA (2 %)", kind: "aporte_empleador", amount: exo ? 0 : ibc * 0.02, detail: exo ? "Exonerada" : undefined });
  add({ code: "E_ICBF", label: "ICBF (3 %)", kind: "aporte_empleador", amount: exo ? 0 : ibc * 0.03, detail: exo ? "Exonerada" : undefined });

  const auxPaid = lines.find((l) => l.code === "AUX")?.amount ?? 0;
  const prestBase = devengadoSalarial + auxPaid;
  add({ code: "P_PRIMA", label: "Provisión de prima", kind: "provision", amount: prestBase / 12 });
  add({ code: "P_CESANTIAS", label: "Provisión de cesantías", kind: "provision", amount: prestBase / 12 });
  add({ code: "P_INTERESES", label: "Provisión de intereses de cesantías", kind: "provision", amount: (prestBase / 12) * 0.12 });
  add({ code: "P_VACACIONES", label: "Provisión de vacaciones", kind: "provision", amount: devengadoSalarial / 24 });

  const sum = (k: LineKind) => lines.filter((l) => l.kind === k).reduce((s, l) => s + l.amount, 0);
  const devengado = sum("devengado");
  const deducciones = sum("deduccion");
  const aportes = sum("aporte_empleador");
  const provisiones = sum("provision");
  return {
    employeeId: emp.employeeId,
    month,
    lines,
    totals: {
      devengado,
      deducciones,
      neto: devengado - deducciones,
      ibc: round0(ibc),
      aportesEmpleador: aportes,
      provisiones,
      costoEmpleador: devengado + aportes + provisiones,
    },
    hours: outHours,
    paidDays: salaryDays,
    warnings,
    blockers,
  };
}
