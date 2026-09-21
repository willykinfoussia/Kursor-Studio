import type { ContextSlice } from "./types";

export function rankSlices(slices: readonly ContextSlice[]): ContextSlice[] {
  return [...slices].sort((a, b) => {
    if (a.priority !== b.priority) return a.priority - b.priority;
    if (a.score !== b.score) return b.score - a.score;
    return a.id.localeCompare(b.id);
  });
}

export function dropOrder(slices: readonly ContextSlice[]): ContextSlice[] {
  return [...slices].sort((a, b) => {
    if (a.priority !== b.priority) return b.priority - a.priority;
    if (a.score !== b.score) return a.score - b.score;
    return b.id.localeCompare(a.id);
  });
}
