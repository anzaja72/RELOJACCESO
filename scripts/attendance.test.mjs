import assert from "node:assert/strict";

function hmToMin(hm) {
  const [h, m] = hm.split(":").map(Number);
  return h * 60 + m;
}

function classify({ punches, schedule, exception, nowHm }) {
  if (exception === "off" || exception === "justified") {
    return "absent";
  }
  const inn = punches.find((p) => p.type === "IN");
  const out = punches.find((p) => p.type === "OUT");
  if (!inn) return "absent";
  const inMin = hmToMin(inn.hm);
  const start = hmToMin(schedule.startHm) + schedule.lateGraceMin;
  if (inMin > start) return "late";
  if (out && hmToMin(out.hm) < hmToMin(schedule.endHm) - 30) return "early_out";
  if (!out && hmToMin(nowHm) > hmToMin(schedule.endHm) + 120) return "omission";
  return "present";
}

const sched = { startHm: "07:00", endHm: "16:00", lateGraceMin: 10 };
assert.equal(classify({ punches: [], schedule: sched, nowHm: "12:00" }), "absent");
assert.equal(
  classify({ punches: [{ type: "IN", hm: "07:25" }], schedule: sched, nowHm: "12:00" }),
  "late",
);
assert.equal(
  classify({
    punches: [
      { type: "IN", hm: "07:00" },
      { type: "OUT", hm: "14:00" },
    ],
    schedule: sched,
    nowHm: "16:00",
  }),
  "early_out",
);
assert.equal(
  classify({ punches: [{ type: "IN", hm: "07:00" }], schedule: sched, nowHm: "19:00" }),
  "omission",
);
assert.equal(
  classify({ punches: [{ type: "IN", hm: "07:05" }], schedule: sched, nowHm: "12:00" }),
  "present",
);

console.log("attendance.test.mjs ok");
