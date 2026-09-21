import { isMutatingToolName, toolOutputOk } from "../AgentStep";
import { normalizeSkillId } from "../skills/ids";
import type { ToolCall } from "../types";
import type { CheckKind } from "./types";
import { sessionHasCompletedPlan } from "../workflow/gates";
import type { WorkflowSessionState } from "../workflow/sessionState";

export type VerificationKinds = Array<CheckKind | "files">;

/** `null` = skip the harness engine this turn. */
export function planVerificationRun(input: {
  session?: WorkflowSessionState | null;
  isSubagent?: boolean;
  toolCalls: readonly ToolCall[];
}): { kinds?: VerificationKinds } | null {
  if (input.isSubagent) return null;
  const session = input.session;
  if (!session?.planApproved) return null;
  if (sessionHasCompletedPlan(session)) {
    if (!session.invokedSkillIds.includes("verification-before-completion")) return null;
    if (
      loadedSkillThisTurn(input.toolCalls, "verification-before-completion")
      || completedPlanTodosThisTurn(input.toolCalls) > 0
      || mutatedThisTurn(input.toolCalls)
    ) {
      return {};
    }
    return null;
  }
  if (completedPlanTodosThisTurn(input.toolCalls) > 0) {
    return { kinds: ["typecheck", "test"] };
  }
  return null;
}

export function completedPlanTodosThisTurn(toolCalls: readonly ToolCall[]): number {
  let count = 0;
  for (const call of toolCalls) {
    if (call.tool !== "update_plan_todo") continue;
    if (!toolOutputOk(call.output)) continue;
    const status = call.input && typeof call.input === "object"
      ? (call.input as { status?: unknown }).status
      : undefined;
    if (status === "completed") count += 1;
  }
  return count;
}

function loadedSkillThisTurn(toolCalls: readonly ToolCall[], skillId: string): boolean {
  for (const call of toolCalls) {
    if (call.tool !== "load_skill" || !toolOutputOk(call.output)) continue;
    const skill = call.input && typeof call.input === "object"
      ? (call.input as { skill?: unknown }).skill
      : undefined;
    if (typeof skill === "string" && normalizeSkillId(skill) === skillId) return true;
  }
  return false;
}

function mutatedThisTurn(toolCalls: readonly ToolCall[]): boolean {
  return toolCalls.some((call) => isMutatingToolName(call.tool) && toolOutputOk(call.output));
}
