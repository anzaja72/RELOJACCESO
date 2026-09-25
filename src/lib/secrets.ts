// Secretos del servidor. En desarrollo hay valores de fábrica para arrancar
// sin configurar nada; en producción se exigen valores reales y el proceso
// no arranca sin ellos (ver src/instrumentation.ts).

const FACTORY_VALUES = new Set([
  "demo-rfp-bio-2026",
  "RelojCR-Admin-2026!",
  "2468",
  "reloj-cr-jwt-v1",
  "reloj-cr-template-key-v1",
  "cambie-esto",
  "cambie-esto-32b",
]);

function strict() {
  return (
    process.env.NODE_ENV === "production" &&
    process.env.ALLOW_INSECURE_DEFAULTS !== "true"
  );
}

function env(name: string) {
  const value = process.env[name]?.trim();
  return value ? value : null;
}

function required(name: string, devFallback: string, minLength = 1) {
  const value = env(name);
  if (!strict()) return value ?? devFallback;
  if (!value) {
    throw new Error(`Falta ${name}. Configúrelo en el entorno antes de desplegar.`);
  }
  if (FACTORY_VALUES.has(value)) {
    throw new Error(`${name} tiene un valor de fábrica. Use uno propio.`);
  }
  if (value.length < minLength) {
    throw new Error(`${name} debe tener al menos ${minLength} caracteres.`);
  }
  return value;
}

export function jwtSecret() {
  return required("JWT_SECRET", "reloj-cr-jwt-v1", 32);
}

export function templateKey() {
  return required("TEMPLATE_KEY", env("DEMO_API_KEY") ?? "reloj-cr-template-key-v1", 32);
}

/** Claves con las que pudieron cifrarse plantillas antes de exigir TEMPLATE_KEY. */
export function legacyTemplateKeys() {
  return [env("DEMO_API_KEY"), "reloj-cr-template-key-v1"].filter(
    (k): k is string => Boolean(k),
  );
}

export function adminPassword() {
  return required("ADMIN_PASSWORD", "RelojCR-Admin-2026!", 12);
}

export function supervisorPin() {
  return required("SUPERVISOR_PIN", "2468", 6);
}

/**
 * Clave para integraciones servidor a servidor. Opcional: sin ella (o con el
 * valor de fábrica en producción) la autenticación por clave API queda apagada.
 */
export function integrationApiKey(): string | null {
  const value = env("DEMO_API_KEY");
  if (!strict()) return value ?? "demo-rfp-bio-2026";
  if (!value || FACTORY_VALUES.has(value) || value.length < 24) return null;
  return value;
}

/** Valida al arrancar. Devuelve los errores en vez de lanzar el primero. */
export function productionSecretErrors(): string[] {
  if (!strict()) return [];
  const errors: string[] = [];
  for (const check of [jwtSecret, templateKey, adminPassword, supervisorPin]) {
    try {
      check();
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
    }
  }
  return errors;
}
