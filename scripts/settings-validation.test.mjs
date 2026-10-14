import assert from "node:assert/strict";
import { endpointError, settingsError } from "../src/lib/settings-validation.ts";

// Aceptados
assert.equal(settingsError({ ot_day_multiplier: "1.25", night_start_hm: "19:00", max_weekly_hours: "42", holidays: '["2026-12-25"]', monthly_report_enabled: "1", retention_days: "365" }), null);
assert.equal(endpointError(""), null);
assert.equal(endpointError("https://contabilidad.example.com/api/informe"), null);

// Rechazados
assert.match(settingsError({ ot_night_multiplier: "9" }), /entre 1 y 5/);
assert.match(settingsError({ ot_day_multiplier: "abc" }), /entre 1 y 5/);
assert.match(settingsError({ night_start_hm: "7pm" }), /HH:MM/);
assert.match(settingsError({ correction_window_hours: "-1" }), /entre 0 y 720/);
assert.match(settingsError({ max_weekly_hours: "200" }), /entre 1 y 84/);
assert.match(settingsError({ holidays: "no-es-json" }), /JSON/);
assert.match(settingsError({ holidays: '["25/12/2026"]' }), /AAAA-MM-DD/);
assert.match(settingsError({ monthly_report_enabled: "si" }), /0 o 1/);

// El informe mensual no debe poder apuntar a la red interna ni a un esquema inseguro
for (const url of [
  "http://externo.example.com/x",
  "https://localhost/x",
  "https://127.0.0.1/x",
  "https://10.0.0.5/x",
  "https://192.168.1.10/x",
  "https://172.16.0.1/x",
  "https://169.254.169.254/latest/meta-data",
  "https://servidor.local/x",
  "https://usuario:clave@example.com/x",
  "ftp://example.com/x",
  "no es url",
]) {
  assert.ok(endpointError(url), `debía rechazar ${url}`);
}
console.log("settings-validation.test.mjs ok");
