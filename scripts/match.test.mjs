import assert from "node:assert/strict";

function euclidean(a, b) {
  let sum = 0;
  for (let i = 0; i < a.length; i += 1) {
    const d = a[i] - b[i];
    sum += d * d;
  }
  return Math.sqrt(sum);
}

function identify(probe, gallery, threshold = 0.48) {
  let best = null;
  for (const entry of gallery) {
    let min = Infinity;
    for (const d of entry.descriptors) min = Math.min(min, euclidean(probe, d));
    if (!best || min < best.distance) best = { employee: entry.employee, distance: min };
  }
  if (!best || best.distance > threshold) return { decision: "unknown", employee: null };
  return { decision: "matched", employee: best.employee };
}

const a = Array.from({ length: 128 }, (_, i) => (i % 7) / 10);
const b = a.map((n) => n + 0.01);
const c = Array.from({ length: 128 }, (_, i) => ((i + 3) % 11) / 8);

const result = identify(b, [
  { employee: { id: "maria" }, descriptors: [a] },
  { employee: { id: "carlos" }, descriptors: [c] },
]);
assert.equal(result.decision, "matched");
assert.equal(result.employee.id, "maria");

const unknown = identify(c, [{ employee: { id: "maria" }, descriptors: [a] }]);
assert.equal(unknown.decision, "unknown");

console.log("match.test.mjs ok");
