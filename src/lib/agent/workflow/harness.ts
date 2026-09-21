import type { AgentInteractionMode } from "../modes";
import type { DelegateReport, SpecialistId } from "../agents/types";
import type { QuestionChoice } from "./questionOptions";
import type { WorkflowSessionState } from "./sessionState";

export interface UserQuestionRequest {
  id: string;
  prompt: string;
  options: QuestionChoice[];
  kind?: "question" | "design" | "plan" | "finish-branch";
}

export interface UserQuestionAnswer {
  selected: string;
  allow: boolean;
}

export interface AgentSpawnInput {
  description: string;
  prompt: string;
  subagentType: SpecialistId;
  model?: string;
}

export interface GitBranchInput {
  action: "create" | "status";
  branch?: string;
}

export interface GitBranchResult {
  branch?: string;
  base?: string;
  message: string;
}

export interface FinishBranchInput {
  choice: "merge" | "pr" | "keep" | "discard";
}

export interface FinishBranchResult {
  message: string;
  conflicts?: string[];
  merged?: boolean;
}

export interface AgentHarnessHooks {
  workflow: WorkflowSessionState;
  isSubagent: boolean;
  askUser(request: UserQuestionRequest): Promise<UserQuestionAnswer>;
  spawnAgent(input: AgentSpawnInput): Promise<DelegateReport>;
  enterPlanMode(): { ok: boolean; message: string };
  switchAgentMode(mode: AgentInteractionMode): { ok: boolean; message: string };
  ensureAgentBranch(input: GitBranchInput): Promise<GitBranchResult>;
  finishBranch(input: FinishBranchInput): Promise<FinishBranchResult>;
  compactNow?(): Promise<void>;
}
