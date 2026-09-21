import type { AgentEvent } from "../types";
import type { EventTraceRecord, EventTraceSink, TraceIdentity } from "./types";

export class EventTracer {
  private seq = 0;
  private readonly records: EventTraceRecord[] = [];

  constructor(
    private readonly getIdentity: () => TraceIdentity,
    private sink?: EventTraceSink,
  ) {}

  setSink(sink: EventTraceSink) {
    this.sink = sink;
  }

  ingest(event: AgentEvent): EventTraceRecord {
    const extracted = idsFromEvent(event);
    const identity = this.getIdentity();
    const record: EventTraceRecord = {
      id: crypto.randomUUID(),
      seq: this.seq += 1,
      ts: Date.now(),
      runId: extracted.runId ?? identity.runId,
      sessionId: identity.sessionId,
      taskId: identity.taskId,
      stepId: extracted.stepId,
      toolCallId: extracted.toolCallId,
      event,
    };
    this.records.push(record);
    void this.sink?.append(record);
    return record;
  }

  list(): readonly EventTraceRecord[] {
    return this.records;
  }

  reset() {
    this.seq = 0;
    this.records.length = 0;
  }
}

export function idsFromEvent(event: AgentEvent): {
  runId?: string;
  stepId?: string;
  toolCallId?: string;
} {
  switch (event.type) {
    case "started":
    case "completed":
    case "error":
    case "cancelled":
    case "verification-started":
    case "verification-check-started":
    case "verification-check-completed":
    case "verification-completed":
      return { runId: event.requestId };
    case "run-resumed":
      return { runId: event.requestId };
    case "tool-started":
    case "tool-completed":
      return { toolCallId: event.id };
    case "permission-required":
      return { toolCallId: event.id };
    case "step-started":
    case "step-finished":
      return { stepId: event.stepId };
    case "task-started":
    case "task-completed":
      return {};
    case "skill-selected":
      return {};
    case "approval-resolved":
      return { toolCallId: event.id };
    case "workflow-started":
      return { runId: event.runId, stepId: event.stepIds[0] };
    case "workflow-step":
    case "workflow-approval-required":
      return { runId: event.runId, stepId: event.stepId };
    case "workflow-checkpoint":
    case "workflow-completed":
    case "orchestration-started":
    case "orchestration-completed":
    case "agent-started":
    case "agent-completed":
      return { runId: event.runId };
    case "change-set-created":
    case "file-change-detected":
    case "change-hunk-created":
    case "review-started":
    case "change-hunk-accepted":
    case "change-hunk-rejected":
    case "file-change-accepted":
    case "file-change-rejected":
    case "change-set-accepted":
    case "change-set-rejected":
    case "review-conflict-detected":
    case "review-decision-undone":
    case "review-completed":
      return { runId: event.runId, toolCallId: event.toolCallId };
    default:
      return {};
  }
}
