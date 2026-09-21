import type { RagResult } from "./types";

function pathScore(path: string | null | undefined, query: string) {
  if (!path) return 0;
  const lower = path.toLowerCase();
  const needle = query.toLowerCase();
  if (lower.includes(needle)) return 0.25;
  if (needle.split(/\s+/).some((part) => part.length > 2 && lower.includes(part))) return 0.12;
  return 0;
}

function recencyScore(metadata: Record<string, unknown>) {
  const indexedAt = Number(metadata.indexedAt ?? 0);
  if (!indexedAt) return 0;
  const ageDays = (Date.now() - indexedAt) / 86_400_000;
  return Math.max(0, 0.1 - ageDays / 365);
}

export function mergeResults(vectorHits: RagResult[], keywordHits: RagResult[], query: string, topK: number): RagResult[] {
  const merged = new Map<string, RagResult>();
  for (const hit of [...vectorHits, ...keywordHits]) {
    const existing = merged.get(hit.id);
    const bonus = pathScore(hit.sourcePath, query) + recencyScore(hit.metadata);
    const next = { ...hit, score: hit.score + bonus };
    if (!existing || next.score > existing.score) merged.set(hit.id, next);
  }
  return [...merged.values()]
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);
}

export const retriever = { merge: mergeResults };
