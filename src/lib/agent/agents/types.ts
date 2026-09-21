import type { PermissionMode } from "../permissions/types";
import type { AgentStatus, AgentStep, ToolCall, WorkStatus } from "../types";
import type { AgentTool } from "../ToolRegistry";

export type AgentContextPolicy = "isolated";

export type SpecialistId = "explore" | "implement" | "review";

export type SpecialistStatus = WorkStatus;

export interface AgentDefinition {
  id: SpecialistId;
  name: string;
  instructions: string;
  tools: string[];
  permissionMode: PermissionMode;
  modelPreference?: string;
  maxSteps: number;
  maxDurationMs: number;
  contextPolicy: AgentContextPolicy;
}

export interface DelegateReport {
  agentId: SpecialistId;
  summary: string;
  findings: string[];
  filesChanged: string[];
  tests: { command: string; ok: boolean }[];
  issues: string[];
}

export interface AgentInstanceSnapshot {
  id: SpecialistId;
  status: AgentStatus;
  steps: AgentStep[];
  toolCalls: ToolCall[];
  tools: AgentTool[];
}

export const PERMISSION_MODE_RANK: Record<PermissionMode, number> = {
  "read-only": 0,
  "workspace-write": 1,
  "full-access": 2,
};

export function minPermissionMode(parent: PermissionMode, child: PermissionMode): PermissionMode {
  return PERMISSION_MODE_RANK[parent] <= PERMISSION_MODE_RANK[child] ? parent : child;
}

export const PIPELINE_AGENT_IDS: readonly SpecialistId[] = [
  "explore",
  "implement",
  "review",
];

export const REPORT_TRAILER = `End with a JSON object and nothing after it:
{"summary":"one or two sentences","findings":["..."],"issues":["..."]}
Do not include the child transcript. summary/findings/issues are for the parent harness.`;
