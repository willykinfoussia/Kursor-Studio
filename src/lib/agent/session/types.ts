import type { AgentMessage, AgentStatus, AgentTask, ToolCall } from "../types";
import type { RecoveryCheckpoint } from "../recovery/types";
import type { WorkflowContext } from "../workflows/types";
import type { WorkflowSessionPersist } from "../workflow/sessionState";
import type { AgentRunRecord, ToolCallRecord } from "../../storage/types";

export const SESSION_COMPACT_PREFIX = "[session-compact]";
export const INTERRUPTED_TOOL_ERROR = "interrupted";
export const COMPACT_KEEP_MESSAGES = 8;

export type SessionStatus = "running" | "interrupted" | "completed" | "failed" | "cancelled";

export interface AgentSession {
  id: string;
  projectId: string | null;
  conversationId: string;
  status: SessionStatus;
  startedAt: number;
  updatedAt: number;
  currentStep: string | null;
  currentGoal: string | null;
  checkpointJson: string | null;
}

export interface ProcessJobRef {
  jobId: string;
  command: string;
}

export interface SessionSnapshot {
  messages: AgentMessage[];
  toolCalls: ToolCall[];
  currentTask: AgentTask | null;
  filesChanged: string[];
  currentModel: string | null;
  agentState: AgentStatus;
  processJobs: ProcessJobRef[];
  runId?: string | null;
  compactSummary?: string;
  workflow?: WorkflowContext;
  workflowSession?: WorkflowSessionPersist;
  recovery?: RecoveryCheckpoint;
}

export interface CompactInput {
  messages: AgentMessage[];
  toolCalls: ToolCall[];
  currentTask: AgentTask | null;
  filesChanged: string[];
  currentModel: string | null;
  currentGoal: string | null;
  currentStep: string | null;
  keepCount?: number;
}

export interface CompactResult {
  summary: string;
  decisions: string[];
  currentState: string;
  filesChanged: string[];
  unresolvedIssues: string[];
  keptMessages: AgentMessage[];
}

export interface SessionStore {
  upsert(session: AgentSession): Promise<void>;
  get(id: string): Promise<AgentSession | null>;
  list(projectId?: string | null, status?: SessionStatus | null): Promise<AgentSession[]>;
  listInterrupted(projectId?: string | null): Promise<AgentSession[]>;
}

export interface RunStore {
  upsert(run: AgentRunRecord): Promise<void>;
  get(id: string): Promise<AgentRunRecord | null>;
}

export interface ToolCallStore {
  upsert(call: ToolCallRecord): Promise<void>;
  list(agentRunId: string): Promise<ToolCallRecord[]>;
}

export function emptySnapshot(): SessionSnapshot {
  return {
    messages: [],
    toolCalls: [],
    currentTask: null,
    filesChanged: [],
    currentModel: null,
    agentState: "idle",
    processJobs: [],
  };
}

export function parseCheckpoint(json: string | null | undefined): SessionSnapshot | null {
  if (!json) return null;
  try {
    const value = JSON.parse(json) as SessionSnapshot;
    if (!Array.isArray(value.messages) || !Array.isArray(value.toolCalls)) return null;
    return {
      messages: value.messages,
      toolCalls: value.toolCalls,
      currentTask: value.currentTask ?? null,
      filesChanged: value.filesChanged ?? [],
      currentModel: value.currentModel ?? null,
      agentState: value.agentState ?? "idle",
      processJobs: value.processJobs ?? [],
      runId: value.runId ?? null,
      compactSummary: value.compactSummary,
      workflow: value.workflow,
      workflowSession: value.workflowSession,
      recovery: value.recovery,
    };
  } catch {
    return null;
  }
}

export function serializeCheckpoint(snapshot: SessionSnapshot): string {
  return JSON.stringify(snapshot);
}

export function isInterruptedTool(call: ToolCall): boolean {
  if (call.status === "running") return true;
  if (call.status !== "failed") return false;
  const output = call.output;
  if (!output || typeof output !== "object") return false;
  const record = output as { error?: unknown; ok?: unknown };
  if (record.error === INTERRUPTED_TOOL_ERROR) return true;
  if (typeof record.error === "object" && record.error && "message" in record.error) {
    return String((record.error as { message?: unknown }).message) === INTERRUPTED_TOOL_ERROR;
  }
  return false;
}
