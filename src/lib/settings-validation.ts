// Validación de los ajustes que cambian cálculos o envían datos fuera del sistema.
// Pura (sin dependencias) para poder probarla con `node --experimental-strip-types`.

const HM = /^([01]\d|2[0-3]):[0-5]\d$/;
const DAY = /^\d{4}-\d{2}-\d{2}$/;

const num = (v: string) => (v.trim() === "" ? NaN : Number(v));
const between = (v: string, lo: number, hi: number) => {
  const n = num(v);
  return Number.isFinite(n) && n >= lo && n <= hi;
};
const intBetween = (v: string, lo: number, hi: number) => between(v, lo, hi) && Number.isInteger(num(v));

/** Direcciones privadas o locales: el informe mensual no debe poder apuntar a la red interna. */
function privateHost(host: string) {
  const h = host.toLowerCase();
  if (h === "localhost" || h.endsWith(".localhost") || h.endsWith(".local") || h.endsWith(".internal")) return true;
  if (h === "::1" || h.startsWith("[")) return true;
  const m = /^(\d+)\.(\d+)\.(\d+)\.(\d+)$/.exec(h);
  if (!m) return false;
  const [a, b] = [Number(m[1]), Number(m[2])];
  return (
    a === 10 || a === 127 || a === 0 || (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) || (a === 169 && b === 254) || a >= 224
  );
}

export function endpointError(value: string): string | null {
  if (value === "") return null;
  if (value.length > 500) return "La dirección es demasiado larga";
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return "La dirección del informe no es una URL válida";
  }
  if (url.protocol !== "https:") return "La dirección del informe debe empezar por https://";
  if (url.username || url.password) return "La dirección no puede incluir usuario ni contraseña";
  if (privateHost(url.hostname)) return "La dirección del informe no puede apuntar a una red interna";
  return null;
}

/** Devuelve el primer error en español, o null si los valores son aceptables. */
export function settingsError(body: Record<string, string>): string | null {
  for (const [key, raw] of Object.entries(body)) {
    const value = String(raw ?? "");
    switch (key) {
      case "ot_day_multiplier":
      case "ot_night_multiplier":
      case "ot_holiday_multiplier":
        if (!between(value, 1, 5)) return "Los recargos deben ser un número entre 1 y 5";
        break;
      case "night_start_hm":
      case "night_end_hm":
        if (!HM.test(value)) return "La ventana nocturna debe tener formato HH:MM";
        break;
      case "correction_window_hours":
        if (!intBetween(value, 0, 720)) return "El plazo de corrección debe estar entre 0 y 720 horas";
        break;
      case "unjustified_absence_alert":
        if (!intBetween(value, 0, 31)) return "El umbral de faltas debe estar entre 0 y 31";
        break;
      case "max_weekly_hours":
        if (!between(value, 1, 84)) return "El máximo semanal debe estar entre 1 y 84 horas";
        break;
      case "labor_max_daily_hours":
        if (!between(value, 1, 24)) return "El máximo diario debe estar entre 1 y 24 horas";
        break;
      case "retention_days":
        if (!intBetween(value, 1, 36500)) return "La retención debe estar entre 1 y 36500 días";
        break;
      case "monthly_report_enabled":
        if (value !== "0" && value !== "1") return "El envío automático debe ser 0 o 1";
        break;
      case "monthly_report_endpoint":
        return endpointError(value);
      case "holidays": {
        let list: unknown;
        try {
          list = JSON.parse(value);
        } catch {
          return "Los festivos deben ser una lista JSON de fechas AAAA-MM-DD";
        }
        if (!Array.isArray(list) || list.length > 400 || !list.every((d) => typeof d === "string" && DAY.test(d))) {
          return "Los festivos deben ser una lista JSON de fechas AAAA-MM-DD";
        }
        break;
      }
      default:
    }
  }
  return null;
}
