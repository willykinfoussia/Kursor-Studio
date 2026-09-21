const EXACT = /^(?:yes|y|oui|ouais|ok|okay|sure|go|lancer?|vas[- ]?y|approve(?:d)?|allow(?:ed)?|valide(?:r)?|validé|je valide|c'?est (?:bon|ok|validé)|d'?accord|absolutely|proceed|let'?s go|sounds? good|looks? good|merge|pr|keep|1)[.!]*$/i;

const YES_WITH_TAIL = /^(?:yes|y|oui|ouais)(?:\s*[,!]?\s*(?:please|proceed|go(?: ahead)?|i approve|j['’]approuve|je valide|valide|d'?accord|s'?il te pla[iî]t|svp|i agree|looks? good|sounds? good|c'?est (?:bon|validé)))?[.!]*$/i;

const DESIGN_EXACT = /^(?:yes|y|oui|ouais|je valide|j['’]approuve|c'?est (?:bon|validé)|valide|approved)[.!]*$/i;

const EXACT_NO = /^(?:no|non)[.!]*$/i;
const STARTS_NO = /^(?:no|non)\b/i;
const REJECT_STACK = /\b(?:architecture|stack|local(?:e|ement)?|backend|full[- ]?stack)\b/i;

const HEDGE = /\b(?:mais|but|sauf|except|non|no|not|don'?t|jamais|change|modifi)\b/i;

function shortReply(text: string): string | null {
  const trimmed = text.trim();
  if (!trimmed || trimmed.length > 80) return null;
  if (HEDGE.test(trimmed)) return null;
  return trimmed;
}

/** True for short EN/FR approvals, including option labels like "Yes, proceed". */
export function isAffirmativeReply(text: string): boolean {
  const trimmed = shortReply(text);
  if (!trimmed) return false;
  if (EXACT.test(trimmed)) return true;
  if (YES_WITH_TAIL.test(trimmed)) return true;
  return false;
}

/** True only for an explicit design yes — not ok, d'accord, sure, go, or 1. */
export function isDesignApprovalReply(text: string): boolean {
  const trimmed = shortReply(text);
  if (!trimmed) return false;
  if (DESIGN_EXACT.test(trimmed)) return true;
  if (YES_WITH_TAIL.test(trimmed)) return true;
  return false;
}

/** True for a short no, or a no that refuses stack / architecture / local. */
export function isDesignRejectionReply(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed || trimmed.length > 200) return false;
  if (isDesignApprovalReply(trimmed) || isAffirmativeReply(trimmed)) return false;
  if (EXACT_NO.test(trimmed)) return true;
  return STARTS_NO.test(trimmed) && REJECT_STACK.test(trimmed);
}
