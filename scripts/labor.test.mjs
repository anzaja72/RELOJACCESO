import assert from "node:assert/strict";
import { analyzeLabor, workedIntervals } from "../src/lib/labor.ts";
import { GENESIS_HASH, chainHash, verifyChain } from "../src/lib/integrity.ts";

const TZ = "America/Bogota";
// Bogotá es UTC-5 todo el año: 07:00 local = 12:00Z.
const at = (date, hm) => new Date(`${date}T${hm}:00-05:00`).toISOString();
const shift = (date, inHm, outHm) => [
  { id: `${date}-in`, type: "IN", capturedAt: at(date, inHm) },
  { id: `${date}-out`, type: "OUT", capturedAt: at(date, outHm) },
];

// 1. Un turno normal suma sus horas.
{
  const r = analyzeLabor(shift("2026-10-05", "07:00", "15:30"), TZ);
  assert.equal(r.days[0].hours, 8.5);
  assert.deepEqual(r.findings, []);
}

// 2. Más de 10 h en un día alerta.
{
  const r = analyzeLabor(shift("2026-10-05", "06:00", "18:00"), TZ);
  assert.equal(r.findings.length, 1);
  assert.equal(r.findings[0].kind, "daily_limit");
}

// 3. Semana de lunes a viernes de 9 h = 45 h > 42 alerta semanal, sin pasar el tope de extras.
{
  const punches = ["05", "06", "07", "08", "09"].flatMap((d) => shift(`2026-10-${d}`, "07:00", "16:00"));
  const r = analyzeLabor(punches, TZ);
  const weekly = r.findings.find((f) => f.kind === "weekly_limit");
  assert.equal(weekly.hours, 45);
  assert.ok(!weekly.message.includes("tope"));
}

// 4. Siete días seguidos sin descanso.
{
  const punches = ["05", "06", "07", "08", "09", "10", "11"].flatMap((d) => shift(`2026-10-${d}`, "08:00", "12:00"));
  const r = analyzeLabor(punches, TZ);
  assert.ok(r.findings.some((f) => f.kind === "no_rest" && f.hours === 7));
}

// 5. Una salida olvidada no inventa horas: el IN huérfano se descarta.
{
  const punches = [
    { id: "a", type: "IN", capturedAt: at("2026-10-05", "07:00") },
    { id: "b", type: "IN", capturedAt: at("2026-10-06", "07:00") },
    { id: "c", type: "OUT", capturedAt: at("2026-10-06", "12:00") },
  ];
  const { intervals, orphans } = workedIntervals(punches);
  assert.equal(intervals.length, 1);
  assert.equal(orphans, 1);
}

// 6. Cadena de hashes: íntegra, y se rompe al editar o borrar un eslabón.
{
  const rows = [];
  let prev = GENESIS_HASH;
  for (let i = 0; i < 4; i += 1) {
    const e = { id: `e${i}`, type: "punch.created", payload: JSON.stringify({ i }), created_at: `2026-10-0${i + 1}T00:00:00Z` };
    const hash = chainHash(prev, e);
    rows.push({ ...e, prev_hash: prev, hash });
    prev = hash;
  }
  assert.equal(verifyChain(rows).ok, true);

  const edited = rows.map((r) => ({ ...r }));
  edited[1].payload = JSON.stringify({ i: 99 });
  const bad = verifyChain(edited);
  assert.equal(bad.ok, false);
  assert.equal(bad.brokenAt, "e1");

  const deleted = rows.filter((r) => r.id !== "e1");
  assert.equal(verifyChain(deleted).ok, false);

  // La retención borra los más viejos: el resto sigue siendo válido.
  assert.equal(verifyChain(rows.slice(2)).ok, true);
}

console.log("labor.test.mjs ok");
