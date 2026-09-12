import { MATCH_THRESHOLD } from "@/lib/config";
import type { IdentifyResult, Employee } from "@/lib/types";

export function euclidean(a: number[], b: number[]): number {
  const n = Math.min(a.length, b.length);
  let sum = 0;
  for (let i = 0; i < n; i += 1) {
    const d = a[i] - b[i];
    sum += d * d;
  }
  return Math.sqrt(sum);
}

export type GalleryEntry = {
  employee: Employee;
  descriptors: number[][];
};

export function identifyFace(
  probe: number[],
  gallery: GalleryEntry[],
  threshold = MATCH_THRESHOLD,
): IdentifyResult {
  if (!probe.length || !gallery.length) {
    return { decision: "unknown", employee: null, score: null, threshold };
  }

  let best: { employee: Employee; distance: number } | null = null;

  for (const entry of gallery) {
    if (!entry.descriptors.length) continue;
    let min = Number.POSITIVE_INFINITY;
    for (const descriptor of entry.descriptors) {
      if (descriptor.length !== probe.length) continue;
      const distance = euclidean(probe, descriptor);
      if (distance < min) min = distance;
    }
    if (Number.isFinite(min) && (!best || min < best.distance)) {
      best = { employee: entry.employee, distance: min };
    }
  }

  if (!best) {
    return { decision: "unknown", employee: null, score: null, threshold };
  }

  const matched = best.distance <= threshold;
  return {
    decision: matched ? "matched" : "unknown",
    employee: matched ? best.employee : null,
    score: Number(best.distance.toFixed(4)),
    threshold,
  };
}
