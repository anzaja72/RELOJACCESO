/**
 * Cronograma semanal por tienda (RF-04, RF-06, RN-01, RN-10). Funciones puras.
 */

export type CellKind = "turno" | "descanso" | "novedad";

export type PlanCell = {
  employeeId: string;
  date: string;
  kind: CellKind;
  startHm?: string | null;
  endHm?: string | null;
  lunchMin?: number | null;
  note?: string | null;
};

export type CoverageGap = { date: string; fromHm: string; toHm: string };

const HM = /^([01]\d|2[0-3]):[0-5]\d$/;

export function isHm(value: unknown): value is string {
  return typeof value === "string" && HM.test(value);
}

export function hmToMin(hm: string) {
  const [h, m] = hm.split(":").map(Number);
  return h * 60 + m;
}

export function minToHm(min: number) {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function parseDate(date: string) {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function fmtDate(d: Date) {
  return d.toISOString().slice(0, 10);
}

export function addDays(date: string, days: number) {
  const d = parseDate(date);
  d.setUTCDate(d.getUTCDate() + days);
  return fmtDate(d);
}

/** Lunes de la semana que contiene `date`. */
export function mondayOf(date: string) {
  const d = parseDate(date);
  const offset = (d.getUTCDay() + 6) % 7;
  return addDays(date, -offset);
}

export function weekDates(weekStart: string) {
  return Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
}

/** Duración de la franja; si la salida es menor que la entrada, cruza medianoche. */
export function spanMin(startHm: string, endHm: string) {
  const span = hmToMin(endHm) - hmToMin(startHm);
  return span > 0 ? span : span + 24 * 60;
}

/** Minutos netos programados de una celda: solo turnos, sin la pausa de almuerzo. */
export function cellMinutes(cell: PlanCell) {
  if (cell.kind !== "turno" || !isHm(cell.startHm) || !isHm(cell.endHm)) return 0;
  return Math.max(0, spanMin(cell.startHm, cell.endHm) - (cell.lunchMin ?? 0));
}

export function totalsByEmployee(cells: PlanCell[]) {
  const totals: Record<string, number> = {};
  for (const cell of cells) {
    totals[cell.employeeId] = (totals[cell.employeeId] ?? 0) + cellMinutes(cell);
  }
  return totals;
}

/** Errores de una celda; vacío si es válida. */
export function validateCell(cell: PlanCell): string[] {
  const errors: string[] = [];
  if (!["turno", "descanso", "novedad"].includes(cell.kind)) errors.push("tipo de celda inválido");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(cell.date)) errors.push("fecha inválida");
  if (cell.kind === "turno") {
    if (!isHm(cell.startHm) || !isHm(cell.endHm)) errors.push("entrada y salida HH:MM obligatorias");
    else if (cell.startHm === cell.endHm) errors.push("entrada y salida iguales");
    const lunch = cell.lunchMin ?? 0;
    if (!Number.isInteger(lunch) || lunch < 0 || lunch > 180) errors.push("almuerzo entre 0 y 180 min");
    if (isHm(cell.startHm) && isHm(cell.endHm) && lunch >= spanMin(cell.startHm, cell.endHm)) {
      errors.push("el almuerzo no puede cubrir todo el turno");
    }
  }
  return errors;
}

/**
 * Franjas de apertura sin ningún responsable de turno (gerente o coordinador) programado.
 * Los turnos que cruzan medianoche cubren hasta el cierre del día en que empiezan.
 */
export function coverageGaps(input: {
  dates: string[];
  opensHm: string;
  closesHm: string;
  cells: PlanCell[];
  leadIds: Set<string>;
}): CoverageGap[] {
  const open = hmToMin(input.opensHm);
  const close = hmToMin(input.closesHm) || 24 * 60;
  const gaps: CoverageGap[] = [];
  for (const date of input.dates) {
    const spans = input.cells
      .filter((c) => c.date === date && c.kind === "turno" && input.leadIds.has(c.employeeId))
      .filter((c) => isHm(c.startHm) && isHm(c.endHm))
      .map((c) => {
        const start = hmToMin(c.startHm!);
        return [start, start + spanMin(c.startHm!, c.endHm!)] as const;
      })
      .sort((a, b) => a[0] - b[0]);
    let cursor = open;
    for (const [start, end] of spans) {
      if (start > cursor && cursor < close) {
        gaps.push({ date, fromHm: minToHm(cursor), toHm: minToHm(Math.min(start, close)) });
      }
      cursor = Math.max(cursor, end);
      if (cursor >= close) break;
    }
    if (cursor < close) gaps.push({ date, fromHm: minToHm(cursor), toHm: minToHm(close) });
  }
  return gaps;
}

export function fmtHours(min: number | null | undefined) {
  if (min == null) return "—";
  const sign = min < 0 ? "−" : "";
  const abs = Math.abs(min);
  return `${sign}${Math.floor(abs / 60)}:${String(abs % 60).padStart(2, "0")}`;
}
