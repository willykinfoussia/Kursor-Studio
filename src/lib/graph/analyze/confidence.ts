import { clamp01 } from "../config";
import type { Evidence } from "../types";

/** Deterministic noisy-OR: 1 - Π(1 - score), clamped to [0, 1]. */
export function combineConfidence(evidence: readonly Evidence[]): number {
  if (evidence.length === 0) return 0;
  let remaining = 1;
  for (const item of evidence) remaining *= 1 - clamp01(item.score);
  return clamp01(1 - remaining);
}

export function mergeEvidence(evidence: readonly Evidence[]): Evidence[] {
  const byType = new Map<string, Evidence>();
  for (const item of evidence) {
    const current = byType.get(item.type);
    if (!current || item.score > current.score) {
      byType.set(item.type, {
        ...item,
        details: current?.details && current.details !== item.details
          ? `${current.details}; ${item.details ?? ""}`.replace(/; $/, "")
          : item.details,
      });
    }
  }
  return [...byType.values()].sort((left, right) => left.type.localeCompare(right.type));
}
