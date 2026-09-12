export const APP = {
  name: "Reloj CR",
  rfp: "RFP-BIO-2026-01",
  country: "Costa Rica",
  tagline: "Reloj CR · Oferta software v1 — asistencia biométrica 100% navegador",
  edition: "oferta-software-v1",
} as const;

export const MATCH_THRESHOLD = 0.48;
export const DUPLICATE_COOLDOWN_MS = 45_000;
export const TERMINAL_ONLINE_MS = 45_000;
export const FACE_MIN_BOX_RATIO = 0.16;
export const FACE_MIN_SCORE = 0.55;
export const ENROLL_SAMPLES = 3;

export const DEMO_API_KEY =
  process.env.DEMO_API_KEY ||
  process.env.NEXT_PUBLIC_DEMO_API_KEY ||
  "demo-rfp-bio-2026";

export const PUBLIC_API_KEY =
  process.env.NEXT_PUBLIC_DEMO_API_KEY || "demo-rfp-bio-2026";

export const MODEL_BYTES = {
  tinyFaceDetector: "190 KB",
  landmarks68: "350 KB",
  recognition: "6.2 MB",
  total: "~6.8 MB",
} as const;
