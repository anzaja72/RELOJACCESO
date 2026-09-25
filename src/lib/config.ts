export const APP = {
  name: "Reloj CR",
  rfp: "RFP-BIO-2026-01",
  country: "Colombia",
  tagline: "Reloj CR · Oferta software v1 — asistencia biométrica 100% navegador",
  edition: "oferta-software-v1",
} as const;

// Colombia no tiene horario de verano: UTC-5 todo el año.
export const TIMEZONE = "America/Bogota";
export const UTC_OFFSET = "-05:00";
export const LOCALE = "es-CO";

/** Fecha local (YYYY-MM-DD) en la zona de operación. */
export function localDay(date: Date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TIMEZONE }).format(date);
}

/**
 * Límites de un día local en UTC ISO, comparables con los timestamps guardados
 * (siempre `...Z`). Comparar contra `...-05:00` como texto excluiría la noche.
 */
export function dayBoundsUtc(day: string) {
  return {
    from: new Date(`${day}T00:00:00${UTC_OFFSET}`).toISOString(),
    to: new Date(`${day}T23:59:59.999${UTC_OFFSET}`).toISOString(),
  };
}

/** Mediodía local del día, para calcular el día de la semana sin saltos de fecha. */
export function localNoon(day: string) {
  return `${day}T12:00:00${UTC_OFFSET}`;
}

export const MATCH_THRESHOLD = 0.48;
export const DUPLICATE_COOLDOWN_MS = 45_000;
export const TERMINAL_ONLINE_MS = 45_000;
export const FACE_MIN_BOX_RATIO = 0.16;
export const FACE_MIN_SCORE = 0.55;
export const ENROLL_SAMPLES = 3;

export const MODEL_BYTES = {
  tinyFaceDetector: "190 KB",
  landmarks68: "350 KB",
  recognition: "6.2 MB",
  total: "~6.8 MB",
} as const;
