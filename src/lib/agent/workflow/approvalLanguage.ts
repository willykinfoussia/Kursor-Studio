import type { TurnReply } from "../workflows/turnClassifier";

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
