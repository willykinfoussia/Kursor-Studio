import { useEffect } from "react";
import { agentRuntime } from "../lib/agent/AgentRuntime";
import { toRunEvent } from "../lib/workflow/events";
import { useRunStore } from "../stores/runStore";
import { useWorkflowStore } from "../stores/workflowStore";

export function useRunObservability() {
  useEffect(() => {
    const traces = agentRuntime.getTrace();
    const store = useRunStore.getState();
    if (traces.length > 0 && store.events.length === 0) {
      for (const trace of traces) store.ingestLive(toRunEvent(trace));
    }
    return agentRuntime.subscribe((event) => {
      if (useWorkflowStore.getState().livePaused && useRunStore.getState().live) return;
      const last = agentRuntime.getTrace().at(-1);
      if (!last || last.event !== event) return;
      useRunStore.getState().ingestLive(toRunEvent(last));
    });
  }, []);
}
