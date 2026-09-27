import type { GoalKind } from "../workflow/sessionState";

export function isDebugGoal(goalKind: GoalKind): boolean {
  return goalKind === "bug";
}
