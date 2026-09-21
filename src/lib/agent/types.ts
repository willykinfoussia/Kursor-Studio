export type AgentStatus =
  | "idle"
  | "planning"
  | "thinking"
  | "streaming"
  | "tool_call"
  | "waiting_approval"
  | "tool_result"
  | "verifying"
  | "fallback"
  | "completed"
  | "failed"
  | "error"
  | "cancelled";

export type AgentStepKind = "model" | "tool" | "verify";

export interface AgentStep {
  id: string;
  index: number;
  kind: AgentStepKind;
  tool?: string;
  input?: unknown;
  output?: unknown;
  status: WorkStatus;
  startedAt: number;
  finishedAt?: number;
}

export interface AgentExecutionSnapshot {
  requestId: string;
  messageId: string;
  status: AgentStatus;
  steps: AgentStep[];
  toolCalls: ToolCall[];
}

export type WorkStatus = "pending" | "running" | "completed" | "failed";

export interface AgentMessage {
  id: string;
  role: "user" | "assistant" | "system" | "tool";
  content: string;
  timestamp: number;
}

export interface AgentTask {
  id: string;
  title: string;
  status: WorkStatus;
  progress: number;
  activity?: string;
}

export interface ToolCall {
  id: string;
  tool: string;
  input: unknown;
  output?: unknown;
  status: WorkStatus;
  startedAt?: number;
  finishedAt?: number;
  sourceTaskId?: string;
}

export interface AgentDefinition {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  tools: string[];
  accent: string;
}

export interface AIModel {
  id: string;
  name: string;
  priority: number;
  enabled: boolean;
}

export interface ProjectContext {
  projectName: string;
  currentFile: string | null;
  currentFileContent: string | null;
}

export interface AIRequestOptions {
  model: string;
  systemPrompt: string;
  signal?: AbortSignal;
  timeoutMs?: number;
  simulateFailureFor?: string[];
  toolsEnabled?: boolean;
  maxSteps?: number;
  maxToolCalls?: number;
  tools?: import("./ToolRegistry").AgentTool[];
  gate?: import("./PermissionGate").PermissionGate;
  executor?: import("./ToolExecutor").ToolExecutor;
  onStatus?: (status: AgentStatus) => void;
  onEvent?: (event: AgentEvent) => void;
  getProjectRoot?: () => string | null;
  skillSession?: import("./skills/session").SkillTurnSession;
}

export interface AgentStream {
  events: AsyncIterable<AgentEvent>;
  usage?: Promise<{ inputTokens?: number; outputTokens?: number } | undefined>;
}

export interface ModelUsage {
  model: string;
  requestCount: number;
  successCount: number;
  errorCount: number;
  fallbackCount: number;
  totalLatencyMs: number;
  inputTokens: number;
  outputTokens: number;
}

export interface ModelUsageSnapshot extends ModelUsage {
  successRate: number;
  fallbackRate: number;
  avgLatencyMs: number;
  costEstimateUsd: number;
}

export type AgentEvent =
  | { type: "started"; requestId: string; messageId: string; model: string; userMessage: AgentMessage }
  | { type: "text-delta"; messageId: string; text: string }
  | { type: "assistant-message"; messageId: string; text: string }
  | { type: "tool-started"; id: string; tool: string; input: unknown; taskId?: string; agentId?: string }
  | { type: "tool-completed"; id: string; tool: string; output: unknown; taskId?: string; agentId?: string }
  | ({ type: "permission-required" } & import("./permissions/types").ApprovalRequest)
  | { type: "step-started"; stepId: string; index: number; kind: AgentStepKind }
  | { type: "step-finished"; stepId: string; index: number; kind: AgentStepKind }
  | {
      type: "verification-started";
      requestId: string;
      trigger?: import("./verification/types").VerificationTrigger;
      checkCount?: number;
    }
  | {
      type: "verification-check-started";
      requestId: string;
      kind: import("./verification/types").CheckKind;
      name?: string;
      command?: string;
      expectedFile?: boolean;
    }
  | {
      type: "verification-check-completed";
      requestId: string;
      result: import("./verification/types").CheckResult;
    }
  | {
      type: "verification-completed";
      requestId: string;
      ok: boolean;
      blockers: string[];
      commands: string[];
      attempt: number;
      results?: import("./verification/types").CheckResult[];
      durationMs?: number;
      trigger?: import("./verification/types").VerificationTrigger;
      cancelled?: boolean;
    }
  | { type: "completed"; requestId: string; messageId: string; model: string }
  | { type: "error"; requestId: string; message: string }
  | { type: "fallback"; fromModel: string; toModel: string; reason: string }
  | { type: "cancelled"; requestId: string }
  | { type: "context-assembled"; tokensUsed: number; trace: import("./context/types").ContextTraceEntry[]; slices?: import("./context/types").ContextSliceSummary[] }
  | { type: "task-started"; taskId: string; title: string }
  | { type: "task-completed"; taskId: string; status: "completed" | "failed" }
  | { type: "skill-selected"; skillId: string; name: string; reason?: string; version?: string }
  | { type: "skill-check"; considered: string[]; noneApply: boolean }
  | { type: "skill-loaded"; skillId: string; name: string }
  | { type: "design-gate"; reason: string; tool: string }
  | {
    type: "user-question";
    id: string;
    prompt: string;
    options: string[];
    choices?: import("./workflow/questionOptions").QuestionChoice[];
    kind?: "question" | "design" | "plan" | "finish-branch";
  }
  | { type: "plan-written"; path: string }
  | { type: "plan-created"; planId: string; path: string; name: string; overview: string; todoCount: number }
  | { type: "plan-todo-updated"; planId: string; todoId: string; status: string; done: number; total: number }
  | { type: "plan-build-started"; planId: string; path: string }
  | { type: "plan-completed"; planId: string; path: string }
  | { type: "plan-mode"; enabled: boolean }
  | { type: "agent-mode"; mode: import("./modes").AgentInteractionMode }
  | { type: "branch-created"; branch: string; base: string }
  | { type: "merge-conflicts"; branch: string; base: string; files: string[] }
  | { type: "subagent-task-started"; taskId: string; agentId: string; title: string }
  | { type: "subagent-task-completed"; taskId: string; agentId: string }
  | { type: "sdd-task-started"; taskId: string; agentId: string; title: string }
  | { type: "sdd-task-completed"; taskId: string; agentId: string }
  | { type: "permission-classifier"; tool: string; decision: "allow" | "deny" | "ask_human"; reason?: string }
  | { type: "compact_boundary"; trigger: "auto" | "manual"; thrashing?: boolean }
  | { type: "llm-started"; requestId: string; kind: "001" | "sub" | "vrp" | "perm" | "cmp"; model: string }
  | { type: "finish-branch"; choice: "merge" | "pr" | "keep" | "discard" }
  | { type: "approval-resolved"; id: string; kind: "permission" | "workflow"; decision: string; selected?: string }
  | { type: "compacted"; summary: string; kept: number; dropped: number }
  | { type: "run-resumed"; sessionId: string; requestId: string }
  | { type: "hook-denied"; event: string; message: string; metadata?: Record<string, string> }
  | { type: "hook-warned"; event: string; message: string; metadata?: Record<string, string> }
  | { type: "hook-fired"; event: string; hook: string; result: "continue" | "block" | "warn" | "modify"; message?: string }
  | { type: "workflow-started"; runId: string; workflowId: string; complexity: import("./workflows/types").TaskComplexity; stepIds: string[]; goalKind?: import("./workflow/sessionState").GoalKind; skipProcess?: boolean }
  | { type: "workflow-step"; runId: string; stepId: string; status: import("./workflows/types").WorkflowStepStatus }
  | { type: "workflow-checkpoint"; runId: string; checkpoint: import("./workflows/types").WorkflowCheckpoint }
  | { type: "workflow-approval-required"; id: string; runId: string; stepId: string; summary: string }
  | { type: "workflow-completed"; runId: string; workflowId: string; complexity: import("./workflows/types").TaskComplexity; status: "completed" | "rejected" }
  | { type: "recovery-checkpoint"; checkpoint: import("./recovery").RecoveryCheckpoint }
  | { type: "recovery-available"; checkpointId: string }
  | { type: "recovery-dismissed" }
  | { type: "recovery-cleared" }
  | { type: "recovery-rolled-back"; restored: string[]; skippedExternal: string[]; deleted: string[] }
  | { type: "orchestration-started"; runId: string; goal: string; complexity: import("./workflows/types").TaskComplexity; agentIds: string[] }
  | { type: "agent-started"; runId: string; agentId: string; name: string; taskId?: string }
  | { type: "agent-completed"; runId: string; agentId: string; name: string; report: import("./agents/types").DelegateReport; taskId?: string }
  | { type: "orchestration-completed"; runId: string; agentIds: string[]; reports: import("./agents/types").DelegateReport[] }
  | { type: "mcp-server-started"; serverId: string; status?: string }
  | { type: "mcp-server-ready"; serverId: string; toolCount: number; resourceCount?: number; promptCount?: number }
  | { type: "mcp-server-error"; serverId: string; message: string }
  | { type: "mcp-server-disconnected"; serverId: string }
  | { type: "mcp-discovered"; serverId: string; tools: number; resources: number; prompts: number }
  | { type: "mcp-tool-started"; id: string; serverId: string; toolName: string; input?: unknown }
  | { type: "mcp-tool-completed"; id: string; serverId: string; toolName: string; success: boolean }
  | ({ type: "change-set-created" } & import("../review/types").ReviewEventBase)
  | ({ type: "file-change-detected" } & import("../review/types").ReviewEventBase)
  | ({ type: "change-hunk-created" } & import("../review/types").ReviewEventBase)
  | ({ type: "review-started" } & import("../review/types").ReviewEventBase)
  | ({ type: "change-hunk-accepted" } & import("../review/types").ReviewEventBase)
  | ({ type: "change-hunk-rejected" } & import("../review/types").ReviewEventBase)
  | ({ type: "file-change-accepted" } & import("../review/types").ReviewEventBase)
  | ({ type: "file-change-rejected" } & import("../review/types").ReviewEventBase)
  | ({ type: "change-set-accepted" } & import("../review/types").ReviewEventBase)
  | ({ type: "change-set-rejected" } & import("../review/types").ReviewEventBase)
  | ({ type: "review-conflict-detected" } & import("../review/types").ReviewEventBase)
  | ({ type: "review-decision-undone" } & import("../review/types").ReviewEventBase)
  | ({ type: "review-completed" } & import("../review/types").ReviewEventBase & {
      accepted: number;
      rejected: number;
      partial: number;
      conflicted: number;
    })
  | { type: "knowledge-reflect-started"; runId: string }
  | { type: "knowledge-reflect-skipped"; runId: string; reason: string; error?: string }
  | {
      type: "knowledge-reflect-completed";
      runId: string;
      proposalId?: string;
      summary: string;
      skillCount: number;
      specCount: number;
    };

export interface AgentRuntimeSnapshot {
  status: AgentStatus;
  activeModel: string | null;
  isStreaming: boolean;
  messages: AgentMessage[];
  execution: AgentExecutionSnapshot | null;
}

export interface AgentConversation {
  id: string;
  title: string;
  messages: AgentMessage[];
  updatedAt: number;
  projectId?: string | null;
  workflowSession?: import("./workflow/sessionState").WorkflowSessionPersist;
}

export interface RuntimeContext {
  accountId: string;
  projectId: string;
  conversationId: string;
}
