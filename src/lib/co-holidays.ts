// Festivos de Colombia (Ley 51 de 1983, "Ley Emiliani"): los fijos, los que pasan al lunes
// siguiente y los que dependen de la Pascua. Sin dependencias: se prueba con node.

const pad = (n: number) => String(n).padStart(2, "0");
const iso = (d: Date) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
const utc = (y: number, m: number, d: number) => new Date(Date.UTC(y, m - 1, d));
const addDays = (d: Date, n: number) => new Date(d.getTime() + n * 86_400_000);

/** Domingo de Pascua (algoritmo de Meeus/Jones/Butcher). */
function easter(year: number) {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return utc(year, month, day);
}

/** Si no cae en lunes, pasa al lunes siguiente. */
function nextMonday(d: Date) {
  const dow = d.getUTCDay(); // 0 = domingo
  return dow === 1 ? d : addDays(d, (8 - dow) % 7);
}

export function colombianHolidays(year: number): string[] {
  const fixed = [utc(year, 1, 1), utc(year, 5, 1), utc(year, 7, 20), utc(year, 8, 7), utc(year, 12, 8), utc(year, 12, 25)];
  // Santos Reyes, San José, San Pedro y San Pablo, Asunción, Día de la Raza, Todos los Santos, Independencia de Cartagena.
  const moved = [utc(year, 1, 6), utc(year, 3, 19), utc(year, 6, 29), utc(year, 8, 15), utc(year, 10, 12), utc(year, 11, 1), utc(year, 11, 11)].map(nextMonday);
  const e = easter(year);
  const pascua = [
    addDays(e, -3), // Jueves Santo
    addDays(e, -2), // Viernes Santo
    nextMonday(addDays(e, 39)), // Ascensión
    nextMonday(addDays(e, 60)), // Corpus Christi
    nextMonday(addDays(e, 68)), // Sagrado Corazón
  ];
  return [...new Set([...fixed, ...moved, ...pascua].map(iso))].sort();
}

/** Domingo o festivo (para el recargo dominical): `date` es AAAA-MM-DD local. */
export function isSundayOrHoliday(date: string, holidays?: Set<string>) {
  const d = new Date(`${date}T12:00:00Z`);
  if (d.getUTCDay() === 0) return true;
  return (holidays ?? new Set(colombianHolidays(d.getUTCFullYear()))).has(date);
}
