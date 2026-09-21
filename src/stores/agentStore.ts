import { create } from "zustand";
import type { ApprovalRequest } from "../lib/agent/permissions/types";
import type { ChangeLog, RecoveryCheckpoint } from "../lib/agent/recovery";
import type { WebDocument } from "../lib/agent/web";
import type { AgentSession } from "../lib/agent/session/types";
import type { WorkflowApprovalRequest } from "../lib/agent/workflows/types";
import type { HookOutcome } from "../lib/agent/hooks/types";
import type { AgentConversation, AgentMessage, AgentStatus, AgentStepKind, AgentTask, ToolCall, WorkStatus } from "../types/agent";
import type { AgentEvent } from "../lib/agent/types";
import { applyAgentEvent, timelineFromMessages, type ConversationItem } from "../lib/agent/conversation";
import type { AgentInteractionMode } from "../lib/agent/modes";

export interface SpecialistView {
  id: string;
  name: string;
  status: "pending" | "running" | "completed" | "failed";
  summary?: string;
}

export interface HookTraceView {
  event: string;
  hook: string;
  result: HookOutcome;
  message?: string;
}

export interface StepView {
  id: string;
  index: number;
  kind: AgentStepKind;
  status: WorkStatus;
}

export interface CommandLogEntry {
  id: string;
  command: string;
  stdout: string;
  stderr: string;
  exitCode: number | null;
  status: WorkStatus;
}

export interface VerificationView {
  ok: boolean;
  blockers: string[];
  commands: string[];
  attempt: number;
  results?: import("../lib/agent/verification/types").CheckResult[];
  durationMs?: number;
  trigger?: import("../lib/agent/verification/types").VerificationTrigger;
}

export interface PermissionTraceView {
  id: string;
  tool: string;
  reason: string;
  riskLevel: string;
  status: "pending" | "allow-once" | "allow-task" | "allow-permanent" | "deny";
}

export type PendingApprovalEntry =
  | { kind: "permission"; id: string; permission: ApprovalRequest }
  | { kind: "workflow"; id: string; workflow: WorkflowApprovalRequest };

const HOOK_TRACE_MAX = 12;
const COMMAND_LOG_MAX = 20;
const PERMISSION_MAX = 12;
const STEP_MAX = 24;

interface AgentState {
  status: AgentStatus;
  messages: AgentMessage[];
  conversations: AgentConversation[];
  activeConversationId: string;
  activeModel: string | null;
  fallbackFrom: string | null;
  fallbackTo: string | null;
  fallbackReason: string | null;
  error: string | null;
  isStreaming: boolean;
  tasks: AgentTask[];
  toolCalls: ToolCall[];
  filesChanged: string[];
  webDocuments: WebDocument[];
  lastWebSearch: { query: string; count: number; hits: { title: string; url: string }[] } | null;
  specialists: SpecialistView[];
  hookTraces: HookTraceView[];
  recoveryCheckpoint: RecoveryCheckpoint | null;
  changeLog: ChangeLog | null;
  recoveryAvailable: boolean;
  pendingApprovals: PendingApprovalEntry[];
  pendingPermission: ApprovalRequest | null;
  pendingWorkflowApproval: WorkflowApprovalRequest | null;
  interruptedSessions: AgentSession[];
  runTask: AgentTask | null;
  persistedTasks: AgentTask[];
  steps: StepView[];
  commandLog: CommandLogEntry[];
  verification: VerificationView | null;
  permissionHistory: PermissionTraceView[];
  timeline: ConversationItem[];
  timelines: Record<string, ConversationItem[]>;
  toolHistories: Record<string, ToolCall[]>;
  taskStartedAt: number | null;
  planMode: boolean;
  agentMode: AgentInteractionMode;
  agentWorkspace: string | null;
  addMessage: (message: AgentMessage) => void;
  prepareAssistantMessage: (id: string) => void;
  appendDelta: (id: string, text: string) => void;
  setStatus: (status: AgentStatus) => void;
  setActiveModel: (model: string | null) => void;
  setFallback: (from: string, to: string, reason: string) => void;
  clearFallback: () => void;
  setError: (error: string | null) => void;
  setStreaming: (isStreaming: boolean) => void;
  upsertTask: (task: AgentTask) => void;
  upsertTool: (tool: ToolCall) => void;
  addChangedFile: (path: string) => void;
  addWebDocuments: (documents: WebDocument[]) => void;
  setLastWebSearch: (search: { query: string; count: number; hits: { title: string; url: string }[] } | null) => void;
  setSpecialists: (specialists: SpecialistView[]) => void;
  upsertSpecialist: (specialist: SpecialistView) => void;
  addHookTrace: (trace: HookTraceView) => void;
  setRecoveryCheckpoint: (checkpoint: RecoveryCheckpoint | null) => void;
  setRecoveryAvailable: (available: boolean) => void;
  clearRecovery: () => void;
  setPendingPermission: (permission: ApprovalRequest | null) => void;
  setPendingWorkflowApproval: (approval: WorkflowApprovalRequest | null) => void;
  enqueuePendingApproval: (entry: PendingApprovalEntry) => void;
  dequeuePendingApproval: (id: string) => void;
  clearPendingApprovals: () => void;
  setInterruptedSessions: (sessions: AgentSession[]) => void;
  setRunTask: (task: AgentTask | null) => void;
  setPersistedTasks: (tasks: AgentTask[]) => void;
  upsertStep: (step: StepView) => void;
  addCommandLog: (entry: CommandLogEntry) => void;
  setVerification: (report: VerificationView | null) => void;
  addPermissionTrace: (trace: PermissionTraceView) => void;
  resolvePermissionTrace: (id: string, status: PermissionTraceView["status"]) => void;
  applyTimelineEvent: (event: AgentEvent) => void;
  setPlanMode: (planMode: boolean) => void;
  setAgentMode: (agentMode: AgentInteractionMode) => void;
  setAgentWorkspace: (path: string | null) => void;
  resetWork: () => void;
  syncActiveMessages: (messages?: AgentMessage[]) => void;
  saveActiveWorkflow: (snapshot: import("../lib/agent/workflow/sessionState").WorkflowSessionPersist) => void;
  createConversation: () => void;
  switchConversation: (id: string) => void;
  deleteConversation: (id: string) => void;
  reset: () => void;
}

const TITLE_MAX = 42;

export function conversationTitle(messages: AgentMessage[]): string {
  const firstUser = messages.find((message) => message.role === "user");
  if (!firstUser?.content.trim()) return "New chat";
  const compact = firstUser.content.trim().replace(/\s+/g, " ");
  return compact.length > TITLE_MAX ? `${compact.slice(0, TITLE_MAX)}…` : compact;
}

function createEmptyConversation(): AgentConversation {
  return {
    id: crypto.randomUUID(),
    title: "New chat",
    messages: [],
    updatedAt: Date.now(),
  };
}

function mergeWebDocuments(existing: WebDocument[], incoming: WebDocument[]) {
  const next = [...existing];
  for (const document of incoming) {
    const index = next.findIndex((item) => item.url === document.url);
    if (index >= 0) next[index] = document;
    else next.push(document);
  }
  return next;
}

const ephemeralState = {
  status: "idle" as AgentStatus,
  activeModel: null as string | null,
  fallbackFrom: null as string | null,
  fallbackTo: null as string | null,
  fallbackReason: null as string | null,
  error: null as string | null,
  isStreaming: false,
  tasks: [] as AgentTask[],
  toolCalls: [] as ToolCall[],
  filesChanged: [] as string[],
  webDocuments: [] as WebDocument[],
  lastWebSearch: null as { query: string; count: number; hits: { title: string; url: string }[] } | null,
  specialists: [] as SpecialistView[],
  hookTraces: [] as HookTraceView[],
  recoveryCheckpoint: null as RecoveryCheckpoint | null,
  changeLog: null as ChangeLog | null,
  recoveryAvailable: false,
  pendingApprovals: [] as PendingApprovalEntry[],
  pendingPermission: null as ApprovalRequest | null,
  pendingWorkflowApproval: null as WorkflowApprovalRequest | null,
  runTask: null as AgentTask | null,
  steps: [] as StepView[],
  commandLog: [] as CommandLogEntry[],
  verification: null as VerificationView | null,
  permissionHistory: [] as PermissionTraceView[],
  taskStartedAt: null as number | null,
  agentWorkspace: null as string | null,
};

function emptySession() {
  const conversation = createEmptyConversation();
  return {
    ...ephemeralState,
    planMode: false,
    agentMode: "agent" as AgentInteractionMode,
    interruptedSessions: [] as AgentSession[],
    persistedTasks: [] as AgentTask[],
    messages: [] as AgentMessage[],
    conversations: [conversation],
    activeConversationId: conversation.id,
    timeline: [] as ConversationItem[],
    timelines: {} as Record<string, ConversationItem[]>,
    toolHistories: {} as Record<string, ToolCall[]>,
  };
}

function snapshotToolHistories(state: Pick<AgentState, "toolHistories" | "activeConversationId" | "toolCalls">) {
  return {
    ...state.toolHistories,
    [state.activeConversationId]: state.toolCalls.map((item) => ({ ...item })),
  };
}

function snapshotTimelines(state: Pick<AgentState, "timelines" | "activeConversationId" | "timeline">) {
  return {
    ...state.timelines,
    [state.activeConversationId]: state.timeline.map((item) => ({ ...item })),
  };
}

function upsertApproval(entries: PendingApprovalEntry[], entry: PendingApprovalEntry) {
  const exists = entries.some((item) => item.id === entry.id);
  return exists ? entries.map((item) => item.id === entry.id ? entry : item) : [...entries, entry];
}

function syncPendingApprovals(pendingApprovals: PendingApprovalEntry[]) {
  const permission = pendingApprovals.find((entry) => entry.kind === "permission");
  const workflow = pendingApprovals.find((entry) => entry.kind === "workflow");
  return {
    pendingApprovals,
    pendingPermission: permission?.kind === "permission" ? permission.permission : null,
    pendingWorkflowApproval: workflow?.kind === "workflow" ? workflow.workflow : null,
  };
}

function snapshotActive(state: Pick<AgentState, "conversations" | "activeConversationId" | "messages">): AgentConversation[] {
  return state.conversations.map((conversation) =>
    conversation.id === state.activeConversationId
      ? {
          ...conversation,
          messages: state.messages.map((message) => ({ ...message })),
          title: conversationTitle(state.messages),
          updatedAt: Date.now(),
        }
      : conversation,
  );
}

export const useAgentStore = create<AgentState>((set) => ({
  ...emptySession(),
  addMessage: (message) => set((state) => ({
    messages: state.messages.some((item) => item.id === message.id)
      ? state.messages.map((item) => item.id === message.id ? message : item)
      : [...state.messages, message],
  })),
  prepareAssistantMessage: (id) => set((state) => {
    const message: AgentMessage = { id, role: "assistant", content: "", timestamp: Date.now() };
    return {
      messages: state.messages.some((item) => item.id === id)
        ? state.messages.map((item) => item.id === id ? message : item)
        : [...state.messages, message],
    };
  }),
  appendDelta: (id, text) => set((state) => ({
    messages: state.messages.map((message) =>
      message.id === id ? { ...message, content: message.content + text } : message),
  })),
  setStatus: (status) => set({ status }),
  setPlanMode: (planMode) => set((state) => ({
    planMode,
    agentMode: planMode ? "plan" : (state.agentMode === "plan" ? "agent" : state.agentMode),
  })),
  setAgentMode: (agentMode) => set({ agentMode, planMode: agentMode === "plan" }),
  setAgentWorkspace: (agentWorkspace) => set({ agentWorkspace }),
  setActiveModel: (activeModel) => set({ activeModel }),
  setFallback: (fallbackFrom, fallbackTo, fallbackReason) => set({
    status: "fallback",
    fallbackFrom,
    fallbackTo,
    fallbackReason,
  }),
  clearFallback: () => set({ fallbackFrom: null, fallbackTo: null, fallbackReason: null }),
  setError: (error) => set({ error }),
  setStreaming: (isStreaming) => set({ isStreaming }),
  upsertTask: (task) => set((state) => ({
    tasks: state.tasks.some((item) => item.id === task.id)
      ? state.tasks.map((item) => item.id === task.id ? task : item)
      : [...state.tasks, task],
    taskStartedAt: task.status === "running" ? (state.taskStartedAt ?? Date.now()) : state.taskStartedAt,
  })),
  upsertTool: (tool) => set((state) => {
    const existing = state.toolCalls.find((item) => item.id === tool.id);
    const next: ToolCall = {
      ...existing,
      ...tool,
      startedAt: existing?.startedAt ?? tool.startedAt ?? Date.now(),
      finishedAt: tool.finishedAt ?? (
        tool.status === "completed" || tool.status === "failed"
          ? Date.now()
          : existing?.finishedAt
      ),
    };
    return {
      toolCalls: existing
        ? state.toolCalls.map((item) => item.id === tool.id ? next : item)
        : [...state.toolCalls, next],
    };
  }),
  addChangedFile: (path) => set((state) => ({ filesChanged: state.filesChanged.includes(path) ? state.filesChanged : [...state.filesChanged, path] })),
  addWebDocuments: (documents) => set((state) => ({
    webDocuments: mergeWebDocuments(state.webDocuments, documents),
  })),
  setLastWebSearch: (lastWebSearch) => set({ lastWebSearch }),
  setSpecialists: (specialists) => set({ specialists }),
  upsertSpecialist: (specialist) => set((state) => ({
    specialists: state.specialists.some((item) => item.id === specialist.id)
      ? state.specialists.map((item) => item.id === specialist.id ? { ...item, ...specialist } : item)
      : [...state.specialists, specialist],
  })),
  addHookTrace: (trace) => set((state) => ({
    hookTraces: [...state.hookTraces, trace].slice(-HOOK_TRACE_MAX),
  })),
  setRecoveryCheckpoint: (recoveryCheckpoint) => set({
    recoveryCheckpoint,
    changeLog: recoveryCheckpoint?.log ?? null,
  }),
  setRecoveryAvailable: (recoveryAvailable) => set({ recoveryAvailable }),
  clearRecovery: () => set({
    recoveryCheckpoint: null,
    changeLog: null,
    recoveryAvailable: false,
  }),
  setPendingPermission: (pendingPermission) => set((state) => {
    if (pendingPermission) {
      return syncPendingApprovals(upsertApproval(state.pendingApprovals, {
        kind: "permission",
        id: pendingPermission.id,
        permission: pendingPermission,
      }));
    }
    return syncPendingApprovals(state.pendingApprovals.filter((entry) => entry.kind !== "permission"));
  }),
  setPendingWorkflowApproval: (pendingWorkflowApproval) => set((state) => {
    if (pendingWorkflowApproval) {
      return syncPendingApprovals(upsertApproval(state.pendingApprovals, {
        kind: "workflow",
        id: pendingWorkflowApproval.id,
        workflow: pendingWorkflowApproval,
      }));
    }
    return syncPendingApprovals(state.pendingApprovals.filter((entry) => entry.kind !== "workflow"));
  }),
  enqueuePendingApproval: (entry) => set((state) => syncPendingApprovals(upsertApproval(state.pendingApprovals, entry))),
  dequeuePendingApproval: (id) => set((state) => syncPendingApprovals(state.pendingApprovals.filter((entry) => entry.id !== id))),
  clearPendingApprovals: () => set(syncPendingApprovals([])),
  setInterruptedSessions: (interruptedSessions) => set({ interruptedSessions }),
  setRunTask: (runTask) => set((state) => ({
    runTask,
    taskStartedAt: runTask?.status === "running"
      ? (state.taskStartedAt ?? Date.now())
      : runTask ? state.taskStartedAt : null,
  })),
  setPersistedTasks: (persistedTasks) => set({ persistedTasks }),
  upsertStep: (step) => set((state) => ({
    steps: state.steps.some((item) => item.id === step.id)
      ? state.steps.map((item) => item.id === step.id ? { ...item, ...step } : item)
      : [...state.steps, step].slice(-STEP_MAX),
  })),
  addCommandLog: (entry) => set((state) => ({
    commandLog: [
      ...state.commandLog.filter((item) => item.id !== entry.id),
      entry,
    ].slice(-COMMAND_LOG_MAX),
  })),
  setVerification: (verification) => set({ verification }),
  addPermissionTrace: (trace) => set((state) => ({
    permissionHistory: [...state.permissionHistory.filter((item) => item.id !== trace.id), trace].slice(-PERMISSION_MAX),
  })),
  resolvePermissionTrace: (id, status) => set((state) => ({
    permissionHistory: state.permissionHistory.map((item) => item.id === id ? { ...item, status } : item),
  })),
  applyTimelineEvent: (event) => set((state) => ({
    timeline: applyAgentEvent(state.timeline, event, {
      now: Date.now(),
      filesChanged: state.filesChanged,
      changeLog: state.changeLog,
      verification: state.verification,
      commandLog: state.commandLog,
    }),
  })),
  resetWork: () => set(syncPendingApprovals([])),
  syncActiveMessages: (messages) => set((state) => {
    const nextMessages = messages ?? state.messages;
    return {
      messages: nextMessages,
      conversations: state.conversations.map((conversation) =>
        conversation.id === state.activeConversationId
          ? {
              ...conversation,
              messages: nextMessages.map((message) => ({ ...message })),
              title: conversationTitle(nextMessages),
              updatedAt: Date.now(),
            }
          : conversation,
      ),
    };
  }),
  saveActiveWorkflow: (snapshot) => set((state) => ({
    conversations: state.conversations.map((conversation) =>
      conversation.id === state.activeConversationId
        ? { ...conversation, workflowSession: snapshot }
        : conversation,
    ),
  })),
  createConversation: () => set((state) => {
    const conversations = snapshotActive(state);
    const timelines = snapshotTimelines(state);
    const active = conversations.find((conversation) => conversation.id === state.activeConversationId);
    if (active && active.messages.length === 0) {
      return { ...ephemeralState, conversations, messages: [], timeline: [], timelines, toolHistories: snapshotToolHistories(state) };
    }
    const next = createEmptyConversation();
    return {
      ...ephemeralState,
      conversations: [...conversations, next],
      activeConversationId: next.id,
      messages: [],
      timeline: [],
      timelines,
      toolHistories: snapshotToolHistories(state),
    };
  }),
  switchConversation: (id) => set((state) => {
    if (id === state.activeConversationId) return {};
    const conversations = snapshotActive(state);
    const timelines = snapshotTimelines(state);
    const toolHistories = snapshotToolHistories(state);
    const target = conversations.find((conversation) => conversation.id === id);
    if (!target) return {};
    const stored = timelines[id];
    const timeline = stored && stored.length > 0 ? stored : timelineFromMessages(target.messages);
    return {
      ...ephemeralState,
      conversations,
      activeConversationId: id,
      messages: target.messages.map((message) => ({ ...message })),
      timeline: timeline.map((item) => ({ ...item })),
      timelines,
      toolCalls: (toolHistories[id] ?? []).map((item) => ({ ...item })),
      toolHistories,
    };
  }),
  deleteConversation: (id) => set((state) => {
    const remaining = snapshotActive(state).filter((conversation) => conversation.id !== id);
    const timelines = { ...snapshotTimelines(state) };
    const toolHistories = { ...snapshotToolHistories(state) };
    delete timelines[id];
    delete toolHistories[id];
    if (remaining.length === 0) {
      const next = createEmptyConversation();
      return {
        ...ephemeralState,
        conversations: [next],
        activeConversationId: next.id,
        messages: [],
        timeline: [],
        timelines: {},
        toolHistories: {},
      };
    }
    if (id !== state.activeConversationId) {
      return { conversations: remaining, timelines, toolHistories };
    }
    const next = remaining[remaining.length - 1];
    if (!next) return {};
    const storedTimeline = timelines[next.id];
    const timeline = storedTimeline && storedTimeline.length > 0
      ? storedTimeline
      : timelineFromMessages(next.messages);
    return {
      ...ephemeralState,
      conversations: remaining,
      activeConversationId: next.id,
      messages: next.messages.map((message) => ({ ...message })),
      timeline: timeline.map((item) => ({ ...item })),
      toolCalls: (toolHistories[next.id] ?? []).map((item) => ({ ...item })),
      timelines,
      toolHistories,
    };
  }),
  reset: () => set(emptySession()),
}));
