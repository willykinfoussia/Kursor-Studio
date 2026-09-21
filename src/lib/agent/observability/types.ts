import type { AgentEvent } from "../types";

export interface TraceIdentity {
  runId: string | null;
  sessionId: string | null;
  taskId: string | null;
}

export interface EventTraceRecord {
  id: string;
  seq: number;
  ts: number;
  runId: string | null;
  sessionId: string | null;
  taskId: string | null;
  stepId?: string;
  toolCallId?: string;
  event: AgentEvent;
}

export interface EventTraceSink {
  append(record: EventTraceRecord): void | Promise<void>;
}
