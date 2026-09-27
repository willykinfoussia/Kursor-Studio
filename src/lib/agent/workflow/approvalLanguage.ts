import type { TurnReply } from "../workflows/turnClassifier";

const DESIGN_YES_START = /^(?:yes|y|oui|ouais)\b/i;
const DESIGN_YES_HEDGE = /\b(?:mais|but|sauf)\b/i;
const DESIGN_YES_MAX = 80;

/** Short documented yes: oui, Yes, approve, Yes, create the plan now. Not ok or d'accord. */
export function explicitDesignYes(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed || trimmed.length > DESIGN_YES_MAX) return false;
  if (DESIGN_YES_HEDGE.test(trimmed)) return false;
  return DESIGN_YES_START.test(trimmed);
}

/** Soft agreement or an explicit design yes. */
export function isAffirmativeReply(reply: TurnReply): boolean {
  return reply === "affirmative" || reply === "design_yes";
}

/** Explicit design yes. ok, d'accord, sure, and go are affirmative, not this. */
export function isDesignApprovalReply(reply: TurnReply): boolean {
  return reply === "design_yes";
}

/** A refusal, including a no that rejects stack or architecture. */
export function isDesignRejectionReply(reply: TurnReply): boolean {
  return reply === "design_no";
}
