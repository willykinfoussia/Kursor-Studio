import type { PermissionMode } from "../permissions/types";
import type { AgentMessage, AgentStatus } from "../types";

export type EvalSuite = "inspect" | "coding" | "research" | "safety" | "recovery" | "context";

export interface ScriptedToolCall {
  name: string;
  input: unknown;
  hang?: boolean;
}

export interface ScriptedTurn {
  tools?: ScriptedToolCall[];
  text: string;
}

export interface EvalScenario {
  id: string;
  suite: EvalSuite;
  userPrompt: string;
  projectFixture: Record<string, string>;
  script: ScriptedTurn[];
  expectedFiles: Record<string, string | RegExp>;
  forbiddenChanges: string[];
  expectedTools: string[];
  forbiddenTools?: string[];
  verification: { expectOk: boolean; command?: string };
  maxSteps: number;
  maxDurationMs: number;
  maxCostUsd?: number;
  permissions: { mode: PermissionMode; confirmDestructive?: boolean };
  expectStatus: Extract<AgentStatus, "completed" | "failed" | "cancelled">;
  afterRun?: "rollback" | "resume";
  seedMessages?: AgentMessage[];
  realProcess?: boolean;
  realVerification?: boolean;
  expectVerificationSequence?: boolean[];
}

export interface EvalCheck {
  name: string;
  ok: boolean;
  detail: string;
}

export interface EvalReport {
  id: string;
  suite: EvalSuite;
  model: string;
  prompt: string;
  skillSet: string[];
  success: boolean;
  status: AgentStatus;
  steps: number;
  tools: string[];
  fallbacks: number;
  latencyMs: number;
  tokens: { input: number; output: number };
  costEstimateUsd: number;
  filesChanged: string[];
  verification: { ok: boolean; detail: string };
  checks: EvalCheck[];
  workspaceRoot: string;
}
