import type { Employee, Punch } from "@/lib/types";
import { TIMEZONE } from "@/lib/config";

export type Novelty =
  | "on_time"
  | "late"
  | "absent"
  | "early_out"
  | "omission"
  | "present";

export type Schedule = {
  weekday: number;
  startHm: string;
  endHm: string;
  lateGraceMin: number;
};

export type Exception = {
  date: string;
  type: "off" | "shift_change" | "justified";
};

function hmToMin(hm: string) {
  const [h, m] = hm.split(":").map(Number);
  return h * 60 + m;
}

function localParts(iso: string, tz = TIMEZONE) {
  const d = new Date(iso);
  const day = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
  }).format(d);
  const time = new Intl.DateTimeFormat("en-GB", {
    timeZone: tz,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(d);
  return { date: day.slice(0, 10), hm: time, weekday: d.getDay() };
}

export function classifyEmployee(input: {
  employee: Employee;
  punches: Punch[];
  schedule?: Schedule | null;
  exception?: Exception | null;
  now?: string;
  tz?: string;
}): { status: Novelty; lateMin: number; lastPunch: Punch | null } {
  const now = input.now ?? new Date().toISOString();
  const tz = input.tz ?? TIMEZONE;
  const today = localParts(now, tz).date;
  const mine = input.punches.filter((p) => {
    if (p.employeeId !== input.employee.id) return false;
    if (p.decision !== "matched" && p.decision !== "queued") return false;
    return localParts(p.capturedAt, tz).date === today;
  });
  const last = mine[0] ?? null;
  if (input.exception?.type === "off" || input.exception?.type === "justified") {
    return { status: "absent", lateMin: 0, lastPunch: last };
  }
  const inn = mine.find((p) => p.type === "IN");
  const out = mine.find((p) => p.type === "OUT");
  if (!inn) return { status: "absent", lateMin: 0, lastPunch: last };
  const sched = input.schedule;
  if (sched) {
    const inMin = hmToMin(localParts(inn.capturedAt, tz).hm);
    const start = hmToMin(sched.startHm) + sched.lateGraceMin;
    if (inMin > start) {
      return { status: "late", lateMin: inMin - hmToMin(sched.startHm), lastPunch: last };
    }
    if (out) {
      const outMin = hmToMin(localParts(out.capturedAt, tz).hm);
      if (outMin < hmToMin(sched.endHm) - 30) {
        return { status: "early_out", lateMin: 0, lastPunch: last };
      }
    } else {
      const nowMin = hmToMin(localParts(now, tz).hm);
      if (nowMin > hmToMin(sched.endHm) + 120) {
        return { status: "omission", lateMin: 0, lastPunch: last };
      }
    }
  }
  const present = !out || new Date(inn.capturedAt) > new Date(out.capturedAt);
  return { status: present ? "present" : "on_time", lateMin: 0, lastPunch: last };
}
