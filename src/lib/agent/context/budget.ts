import type { ContextBudget } from "./types";
import { estimateTokens } from "./tokens";

export const DEFAULT_MAX_CONTEXT_CHARS = 6_000;
export const RECENT_MESSAGE_COUNT = 6;
export const MAX_SKILL_CHARS = 4_000;
export const MAX_RULE_CHARS = 8_000;
export const MAX_GIT_DIFF_CHARS = 4_000;
export const MAX_RAG_CHUNK_CHARS = 1_200;

export function budgetFromChars(maxContextChars = DEFAULT_MAX_CONTEXT_CHARS): ContextBudget {
  const chars = Number.isFinite(maxContextChars) && maxContextChars > 0
    ? maxContextChars
    : DEFAULT_MAX_CONTEXT_CHARS;
  return {
    maxTokens: Math.ceil(chars / 4),
    maxFileChars: chars,
    maxFiles: 8,
    maxRagChunks: 6,
    maxHistoryMessages: 30,
    maxWebDocs: 6,
    maxGraphFiles: 8,
  };
}

export function mergeBudget(base: ContextBudget, override?: Partial<ContextBudget>): ContextBudget {
  return { ...base, ...override };
}

export function sliceTokens(text: string): number {
  return estimateTokens(text);
}
