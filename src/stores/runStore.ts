import { create } from "zustand";
import { agentRuntime } from "../lib/agent/AgentRuntime";
import { agentRunRepository } from "../lib/storage/agentRunRepository";
import { eventTraceRepository } from "../lib/storage/eventTraceRepository";
import { toRunEvent, toRunEventFromStored, type AgentRunEvent } from "../lib/workflow/events";
import { agentRunFromRecord } from "../lib/workflow/datasources/PersistedRunDataSource";
import type { AgentRun } from "../lib/workflow/types";
import { useAccountStore } from "./accountStore";
import { useAgentStore } from "./agentStore";
import { useProjectStore } from "./projectStore";

interface RunState {
  liveRunId: string | null;
  viewedRunId: string | null;
  events: AgentRunEvent[];
  activeRun: AgentRun | null;
  recentRuns: AgentRun[];
  live: boolean;
  ingestLive: (event: AgentRunEvent) => void;
  followLive: () => void;
  loadRun: (runId: string) => Promise<void>;
  refreshRecent: () => Promise<void>;
  reset: () => void;
}

function emptyRun(id: string, timestamp: number, title?: string): AgentRun {
  return {
    id,
    accountId: useAccountStore.getState().currentAccount?.id ?? "",
    projectId: useProjectStore.getState().currentProject?.id ?? "",
    conversationId: useAgentStore.getState().activeConversationId,
    agentId: "coding-agent",
    status: "running",
    startedAt: timestamp,
    totalSteps: 0,
    totalToolCalls: 0,
    title,
  };
}

export const useRunStore = create<RunState>((set, get) => ({
  liveRunId: null,
  viewedRunId: null,
  events: [],
  activeRun: null,
  recentRuns: [],
  live: true,
  ingestLive: (event) => {
    if (event.type === "text-delta") return;
    if (!event.runId && event.type !== "task-started") return;
    const runId = event.runId || get().liveRunId;
    if (!runId) return;
    const startsRun = event.type === "task-started" || event.type === "started" || event.type === "workflow-started" || event.type === "orchestration-started";
    const switching = Boolean(startsRun && get().liveRunId && get().liveRunId !== runId && get().events.length > 0);
    const following = Boolean(get().live || !get().viewedRunId || get().viewedRunId === runId || switching);

    set((state) => {
      const nextEvents = switching || (startsRun && state.liveRunId !== runId)
        ? [event]
        : (following && (state.liveRunId === runId || !state.liveRunId) ? [...state.events, event] : state.events);
      const title = event.type === "task-started"
        ? event.payload.type === "task-started" ? event.payload.title : state.activeRun?.title
        : event.type === "started" && event.payload.type === "started"
          ? event.payload.userMessage.content.slice(0, 80)
          : state.activeRun?.title;
      return {
        liveRunId: runId,
        viewedRunId: following ? runId : state.viewedRunId,
        live: following,
        events: nextEvents,
        activeRun: following
          ? {
            ...(state.activeRun && state.activeRun.id === runId ? state.activeRun : emptyRun(runId, event.timestamp, title)),
            id: runId,
            title,
            status: event.type === "completed" ? "completed" : event.type === "error" ? "failed" : event.type === "cancelled" ? "cancelled" : "running",
            model: event.type === "started" && event.payload.type === "started" ? event.payload.model : state.activeRun?.model,
            finishedAt: event.type === "completed" || event.type === "error" || event.type === "cancelled" ? event.timestamp : undefined,
            error: event.type === "error" && event.payload.type === "error" ? event.payload.message : state.activeRun?.error,
          }
          : state.activeRun,
      };
    });
  },
  followLive: () => {
    const liveId = get().liveRunId ?? agentRuntime.getRunId();
    const events = agentRuntime.getTrace()
      .filter((trace) => (!liveId || trace.runId === liveId) && trace.event.type !== "text-delta")
      .map(toRunEvent);
    set({
      live: true,
      viewedRunId: liveId,
      liveRunId: liveId,
      events,
    });
  },
  loadRun: async (runId) => {
    const liveId = agentRuntime.getRunId();
    if (liveId === runId) {
      get().followLive();
      return;
    }
    const [record, traces] = await Promise.all([
      agentRunRepository.get(runId),
      eventTraceRepository.list(runId),
    ]);
    const events = traces.map(toRunEventFromStored).filter((item): item is AgentRunEvent => Boolean(item));
    set({
      live: false,
      viewedRunId: runId,
      events,
      activeRun: record ? agentRunFromRecord(record) : emptyRun(runId, events[0]?.timestamp ?? Date.now()),
    });
  },
  refreshRecent: async () => {
    const projectId = useProjectStore.getState().currentProject?.id ?? null;
    const records = await agentRunRepository.list(projectId, 40);
    const live = get().activeRun;
    const recent = records.map((record) => agentRunFromRecord(record));
    if (live && !recent.some((item) => item.id === live.id)) recent.unshift(live);
    set({ recentRuns: recent });
  },
  reset: () => set({
    liveRunId: null,
    viewedRunId: null,
    events: [],
    activeRun: null,
    recentRuns: [],
    live: true,
  }),
}));
