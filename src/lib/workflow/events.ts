import type { AgentEvent } from "../agent/types";
import type { EventTraceRecord as LiveTraceRecord } from "../agent/observability/types";
import type { EventTraceRecord as StoredTraceRecord } from "../storage/types";

export interface AgentRunEvent {
  id: string;
  runId: string;
  timestamp: number;
  sequence: number;
  type: AgentEvent["type"];
  payload: AgentEvent;
  sessionId?: string | null;
  taskId?: string | null;
  stepId?: string;
  toolCallId?: string;
}

export function toRunEvent(trace: LiveTraceRecord): AgentRunEvent {
  return {
    id: trace.id,
    runId: trace.runId ?? "",
    timestamp: trace.ts,
    sequence: trace.seq,
    type: trace.event.type,
    payload: trace.event,
    sessionId: trace.sessionId,
    taskId: trace.taskId,
    stepId: trace.stepId,
    toolCallId: trace.toolCallId,
  };
}

export function toRunEventFromStored(record: StoredTraceRecord): AgentRunEvent | null {
  try {
    const parsed = JSON.parse(record.payloadJson) as {
      event?: AgentEvent;
      runId?: string;
      ts?: number;
      seq?: number;
      sessionId?: string | null;
      taskId?: string | null;
      stepId?: string;
      toolCallId?: string;
    } & Partial<AgentEvent>;
    const event = (parsed.event ?? parsed) as AgentEvent;
    if (!event || typeof event.type !== "string") return null;
    return {
      id: record.id,
      runId: record.runId ?? parsed.runId ?? "",
      timestamp: record.createdAt || parsed.ts || 0,
      sequence: record.seq,
      type: event.type,
      payload: event,
      sessionId: record.sessionId ?? parsed.sessionId,
      taskId: record.taskId ?? parsed.taskId,
      stepId: parsed.stepId,
      toolCallId: parsed.toolCallId,
    };
  } catch {
    return null;
  }
}

export const LAYOUT_SKIP_EVENT_TYPES = new Set<AgentEvent["type"]>([
  "text-delta",
  "assistant-message",
  "verification-check-started",
  "verification-check-completed",
  "hook-fired",
  "hook-warned",
  "recovery-dismissed",
  "recovery-cleared",
  "change-set-created",
  "file-change-detected",
  "change-hunk-created",
  "change-hunk-accepted",
  "change-hunk-rejected",
  "file-change-accepted",
  "file-change-rejected",
  "review-conflict-detected",
  "review-decision-undone",
]);
