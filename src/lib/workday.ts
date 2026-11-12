/**
 * Jornada diaria a partir de las marcaciones reales (RF-07, RF-08, RN-04, RN-05).
 * Nunca inventa marcas: si falta el almuerzo, se cuenta el tiempo real entre
 * entrada y salida y se reporta la incidencia para revisión.
 */

export type DayPunch = { id: string; type: string; capturedAt: string };

export type WorkdayIncident =
  | "sin_entrada"
  | "sin_salida"
  | "almuerzo_ausente"
  | "almuerzo_incompleto"
  | "almuerzo_diferente"
  | "marca_repetida";

export type Workday = {
  date: string;
  firstIn: string | null;
  lunchOut: string | null;
  lunchIn: string | null;
  lastOut: string | null;
  /** Minutos trabajados en tramos cerrados (entrada→salida), sin la pausa. */
  workedMin: number | null;
  /** Minutos reales de almuerzo, si hay salida y regreso. */
  lunchMin: number | null;
  /** Diferencia real − estándar del almuerzo (positivo = más largo). */
  lunchDiffMin: number | null;
  incidents: WorkdayIncident[];
  punchIds: string[];
};

const STARTS = new Set(["IN", "BREAK_END"]);
const ENDS = new Set(["OUT", "BREAK_START"]);

/** Fecha (YYYY-MM-DD), hora (HH:MM) y minuto del día en la zona horaria de la tienda. */
export function localDateTime(iso: string, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(iso));
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "00";
  const hm = `${get("hour")}:${get("minute")}`;
  return {
    date: `${get("year")}-${get("month")}-${get("day")}`,
    hm,
    min: Number(get("hour")) * 60 + Number(get("minute")),
  };
}

/** Calcula la jornada de un empleado en un día local. `punches` en cualquier orden. */
export function computeWorkday(
  punches: DayPunch[],
  timeZone: string,
  lunchStandardMin = 30,
): Workday {
  const sorted = [...punches].sort((a, b) => a.capturedAt.localeCompare(b.capturedAt));
  const at = (p: DayPunch) => localDateTime(p.capturedAt, timeZone);
  const result: Workday = {
    date: sorted[0] ? at(sorted[0]).date : "",
    firstIn: null,
    lunchOut: null,
    lunchIn: null,
    lastOut: null,
    workedMin: null,
    lunchMin: null,
    lunchDiffMin: null,
    incidents: [],
    punchIds: sorted.map((p) => p.id),
  };
  if (sorted.length === 0) return result;

  const flag = (incident: WorkdayIncident) => {
    if (!result.incidents.includes(incident)) result.incidents.push(incident);
  };
  const ms = (p: DayPunch) => new Date(p.capturedAt).getTime();

  let openSince: DayPunch | null = null;
  let lunchStart: DayPunch | null = null;
  let worked = 0;
  let closedSegments = 0;
  let lunch = 0;
  let lunches = 0;

  for (const p of sorted) {
    if (STARTS.has(p.type)) {
      if (p.type === "IN" && !result.firstIn) result.firstIn = at(p).hm;
      if (p.type === "BREAK_END") {
        result.lunchIn = at(p).hm;
        if (lunchStart) {
          lunch += ms(p) - ms(lunchStart);
          lunches += 1;
          lunchStart = null;
        } else {
          flag("almuerzo_incompleto");
        }
      }
      if (openSince) {
        flag("marca_repetida");
        continue;
      }
      openSince = p;
    } else if (ENDS.has(p.type)) {
      if (p.type === "OUT") result.lastOut = at(p).hm;
      if (p.type === "BREAK_START") {
        result.lunchOut = at(p).hm;
        lunchStart = p;
      }
      if (!openSince) {
        flag(p.type === "OUT" && !result.firstIn ? "sin_entrada" : "marca_repetida");
        continue;
      }
      worked += ms(p) - ms(openSince);
      closedSegments += 1;
      openSince = null;
    }
  }

  if (!sorted.some((p) => p.type === "IN")) flag("sin_entrada");
  if (openSince) flag("sin_salida");
  if (lunchStart) flag("almuerzo_incompleto");
  const hasLunchMarks = sorted.some((p) => p.type === "BREAK_START" || p.type === "BREAK_END");
  if (!hasLunchMarks && result.firstIn && result.lastOut) flag("almuerzo_ausente");

  if (closedSegments > 0) result.workedMin = Math.round(worked / 60_000);
  if (lunches > 0) {
    result.lunchMin = Math.round(lunch / 60_000);
    result.lunchDiffMin = result.lunchMin - lunchStandardMin;
    if (result.lunchDiffMin !== 0) flag("almuerzo_diferente");
  }
  return result;
}

export const INCIDENT_LABEL: Record<WorkdayIncident, string> = {
  sin_entrada: "Sin entrada",
  sin_salida: "Sin salida",
  almuerzo_ausente: "Sin marcas de almuerzo",
  almuerzo_incompleto: "Almuerzo incompleto",
  almuerzo_diferente: "Almuerzo distinto al estándar",
  marca_repetida: "Marca repetida o fuera de orden",
};
