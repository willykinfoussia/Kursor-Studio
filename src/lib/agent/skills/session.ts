import type { TaskGrantStore } from "../permissions/grants";
import type { AgentEvent } from "../types";
import type { WorkflowSessionState } from "../workflow/sessionState";
import type { SkillDefinition } from "./types";

export type SkillTurnSession = {
  userInvokedIds: string[];
  invoked: SkillDefinition[];
  grants: TaskGrantStore;
  emit?: (event: AgentEvent) => void;
  workflow?: WorkflowSessionState;
};

export function createSkillTurnSession(
  grants: TaskGrantStore,
  emit?: (event: AgentEvent) => void,
  workflow?: WorkflowSessionState,
): SkillTurnSession {
  return { userInvokedIds: [], invoked: [], grants, emit, workflow };
}
