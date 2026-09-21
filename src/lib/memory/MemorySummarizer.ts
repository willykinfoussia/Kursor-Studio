import type { Memory } from "./types";

export function summarizeMemory(memory: Memory): string {
  const compact = memory.content.trim().replace(/\s+/g, " ");
  const prefix = memory.memoryKey ? `${memory.memoryKey}: ` : "";
  return `${prefix}${compact}`.slice(0, 280);
}

export const memorySummarizer = { summarize: summarizeMemory };
