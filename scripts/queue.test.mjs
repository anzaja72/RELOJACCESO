import assert from "node:assert/strict";

/** Contrato G04: la cola se vacía por id aceptado o duplicado; nunca se reinserta un ULID ya aplicado. */
function mergeSync(queued, accepted, duplicates) {
  const done = new Set([...accepted, ...duplicates]);
  const leftover = [];
  const seen = new Set();
  for (const item of queued) {
    if (done.has(item.id) || seen.has(item.id)) continue;
    seen.add(item.id);
    leftover.push(item);
  }
  return leftover;
}

const queued = [
  { id: "01HXAAA", type: "IN" },
  { id: "01HXBBB", type: "OUT" },
  { id: "01HXAAA", type: "IN" },
];

const leftover = mergeSync(queued, ["01HXAAA"], []);
assert.equal(leftover.length, 1);
assert.equal(leftover[0].id, "01HXBBB");

const none = mergeSync(queued, ["01HXAAA"], ["01HXBBB"]);
assert.equal(none.length, 0);

const failed = mergeSync(queued, [], []);
assert.equal(failed.map((x) => x.id).join(","), "01HXAAA,01HXBBB");

console.log("queue.test.mjs ok");
