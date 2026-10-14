import assert from "node:assert/strict";
import { colombianHolidays, isSundayOrHoliday } from "../src/lib/co-holidays.ts";

// Calendario oficial 2026 (decreto de festivos): 18 fechas.
assert.deepEqual(colombianHolidays(2026), [
  "2026-01-01", "2026-01-12", "2026-03-23", "2026-04-02", "2026-04-03", "2026-05-01",
  "2026-05-18", "2026-06-08", "2026-06-15", "2026-06-29", "2026-07-20", "2026-08-07",
  "2026-08-17", "2026-10-12", "2026-11-02", "2026-11-16", "2026-12-08", "2026-12-25",
]);

// Los festivos trasladados siempre caen en lunes y no hay más de 18.
for (const year of [2024, 2025, 2026, 2027, 2028]) {
  const list = colombianHolidays(year);
  assert.ok(list.length >= 17 && list.length <= 18, `${year}: ${list.length}`);
  for (const d of ["-01-12", "-01-06"]) void d;
  const moved = list.filter((d) => !["-01-01", "-05-01", "-07-20", "-08-07", "-12-08", "-12-25"].some((s) => d.endsWith(s)));
  for (const d of moved) {
    const dow = new Date(`${d}T12:00:00Z`).getUTCDay();
    // Jueves y Viernes Santo son los únicos que no son lunes.
    assert.ok(dow === 1 || dow === 4 || dow === 5, `${d} día ${dow}`);
  }
}

assert.equal(isSundayOrHoliday("2026-10-04"), true); // domingo
assert.equal(isSundayOrHoliday("2026-10-12"), true); // festivo
assert.equal(isSundayOrHoliday("2026-10-13"), false);
console.log("co-holidays.test.mjs ok");
