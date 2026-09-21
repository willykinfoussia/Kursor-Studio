import type { WorkStatus } from "../types";

export type ChangeFlag = "A" | "M" | "D";

export interface ChangePath {
  flag: ChangeFlag;
  path: string;
}

export interface PlanStepView {
  id: string;
  title: string;
  status: WorkStatus;
}

export type SystemNoticeKind =
  | "resume"
  | "checkpoint"
  | "hook"
  | "recovery"
  | "error"
  | "compacted"
  | "specialist"
  | "mode"
  | "knowledge";

export type ConversationItem =
  | { type: "user"; id: string; messageId: string }
  | { type: "assistant"; id: string; messageId: string; content: string }
  | { type: "plan"; id: string; steps: PlanStepView[]; status: "running" | "completed" }
  | { type: "task"; id: string; taskId: string; title: string; status: WorkStatus; progress: number; activity?: string; agentId?: string; toolCallIds?: string[] }
  | { type: "tool"; id: string; toolCallId: string }
  | {
      type: "verification";
      id: string;
      status: "running" | "completed";
      ok?: boolean;
      blockers: string[];
      commands: string[];
      attempt: number;
      results?: import("../verification/types").CheckResult[];
    }
  | { type: "changes"; id: string; paths: ChangePath[] }
  | { type: "approval"; id: string; kind: "permission" | "workflow"; approvalId: string }
  | { type: "fallback"; id: string; fromModel: string; toModel: string; reason: string }
  | { type: "completion"; id: string; summary: string; filesChanged?: number; verificationOk?: boolean; testsHint?: string }
  | {
      type: "review-summary";
      id: string;
      changeSetId: string;
      accepted: number;
      rejected: number;
      partial: number;
      conflicted: number;
    }
  | { type: "system"; id: string; kind: SystemNoticeKind; text: string }
  | { type: "knowledge-proposal"; id: string; proposalId: string; summary: string }
  | { type: "plan-card"; id: string; planId: string }
  | {
      type: "user-question";
      id: string;
      questionId: string;
      prompt: string;
      options: import("../workflow/questionOptions").QuestionChoice[];
      kind?: "question" | "design" | "plan" | "finish-branch";
      selected?: string;
    };

export interface TimelineContext {
  now?: number;
  filesChanged?: string[];
  changeLog?: { created: string[]; modified: string[]; deleted: string[] } | null;
  verification?: { ok: boolean; blockers: string[]; commands: string[]; attempt: number } | null;
  commandLog?: { command: string; status: string; exitCode: number | null }[];
}

export const DEFAULT_AGENT_CHAT_PREFS = {
  compactTools: true,
  autoCollapseCompletedTools: true,
  showToolDetails: false,
  showThinkingDetails: false,
  stickyCurrentTask: true,
} as const;

export type AgentChatPrefs = { -readonly [K in keyof typeof DEFAULT_AGENT_CHAT_PREFS]: boolean };
