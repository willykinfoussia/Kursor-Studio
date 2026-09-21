import { describe, expect, it } from "vitest";
import { EventTracer, idsFromEvent } from "../EventTracer";
import type { AgentEvent } from "../../types";

describe("EventTracer", () => {
  it("stamps runId sessionId taskId and extracts step and tool ids", () => {
    const tracer = new EventTracer(() => ({
      runId: "run-1",
      sessionId: "sess-1",
      taskId: "task-1",
    }));
    const started = tracer.ingest({
      type: "started",
      requestId: "req-9",
      messageId: "m1",
      model: "m",
      userMessage: { id: "u", role: "user", content: "hi", timestamp: 1 },
    });
    expect(started.runId).toBe("req-9");
    expect(started.sessionId).toBe("sess-1");
    expect(started.taskId).toBe("task-1");
    expect(started.seq).toBe(1);

    const step = tracer.ingest({ type: "step-started", stepId: "s1", index: 0, kind: "tool" });
    expect(step.stepId).toBe("s1");
    expect(step.runId).toBe("run-1");

    const tool = tracer.ingest({ type: "tool-started", id: "tc-1", tool: "read_file", input: {} });
    expect(tool.toolCallId).toBe("tc-1");
    expect(tracer.list()).toHaveLength(3);
  });

  it("idsFromEvent reads workflow and verification envelopes", () => {
    const verify: AgentEvent = {
      type: "verification-completed",
      requestId: "run-2",
      ok: false,
      blockers: ["test failed"],
      commands: ["node --test"],
      attempt: 1,
    };
    expect(idsFromEvent(verify)).toEqual({ runId: "run-2" });
    expect(idsFromEvent({
      type: "workflow-step",
      runId: "run-3",
      stepId: "implement",
      status: "running",
    })).toEqual({ runId: "run-3", stepId: "implement" });
  });
});
