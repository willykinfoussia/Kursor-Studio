export type TaskComplexity = "simple" | "medium" | "complex";

export type WorkflowStepStatus = "pending" | "running" | "completed" | "skipped" | "blocked" | "failed";

export type WorkflowArtifactKind = "notes" | "spec" | "plan" | "summary";

export interface WorkflowStep {
  id: string;
  title: string;
  minComplexity: TaskComplexity;
  requiresApproval: boolean;
  batch: string;
  prompt: string;
}

export interface Workflow {
  id: string;
  name: string;
  description: string;
  steps: WorkflowStep[];
  requiredCapabilities?: string[];
  preferredMcp?: string[];
}

export interface WorkflowArtifact {
  stepId: string;
  kind: WorkflowArtifactKind;
  text: string;
}

export interface WorkflowCheckpoint {
  stepId: string;
  status: WorkflowStepStatus;
  artifacts: WorkflowArtifact[];
  startedAt: number;
  finishedAt?: number;
}

export interface WorkflowStepState {
  id: string;
  status: WorkflowStepStatus;
}

export interface WorkflowContext {
  runId: string;
  workflowId: string;
  goal: string;
  complexity: TaskComplexity;
  currentStepId: string | null;
  status: "running" | "completed" | "rejected" | "failed";
  steps: WorkflowStepState[];
  checkpoints: WorkflowCheckpoint[];
  artifacts: WorkflowArtifact[];
}

export interface WorkflowApprovalChoice {
  id: string;
  label: string;
  description?: string;
}

export interface WorkflowApprovalRequest {
  id: string;
  runId: string;
  stepId: string;
  summary: string;
  options?: WorkflowApprovalChoice[];
}

export type WorkflowApprovalDecision = "allow" | "deny";

export interface TurnRequest {
  goal: string;
  overlay: string;
  steps: WorkflowStep[];
  context: WorkflowContext;
}

export interface TurnResult {
  content: string;
  requestId?: string;
  messageId?: string;
  model?: string | null;
}

export interface TurnRunner {
  runTurn(request: TurnRequest): Promise<TurnResult>;
  waitApproval(request: WorkflowApprovalRequest): Promise<WorkflowApprovalDecision>;
}

export const COMPLEXITY_RANK: Record<TaskComplexity, number> = {
  simple: 0,
  medium: 1,
  complex: 2,
};
