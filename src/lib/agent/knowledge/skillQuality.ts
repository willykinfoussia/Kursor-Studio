import type { SkillProposalAction } from "./types";

export const MIN_SKILL_INSTRUCTIONS = 80;

const STEP_LINE = /^(?:\d+[.)]|[-*])\s+\S+/;

export function isReusableSkill(action: Pick<SkillProposalAction, "rationale" | "draft">): boolean {
  const description = action.draft?.description?.trim() ?? "";
  const instructions = action.draft?.instructions?.trim() ?? "";
  const rationale = action.rationale.trim();
  if (!/^use when\b/i.test(description)) return false;
  if (instructions.length < MIN_SKILL_INSTRUCTIONS) return false;
  if (rationale && instructions === rationale) return false;
  const steps = instructions
    .split(/\n/)
    .map((line) => line.trim())
    .filter((line) => STEP_LINE.test(line));
  return steps.length >= 2;
}
