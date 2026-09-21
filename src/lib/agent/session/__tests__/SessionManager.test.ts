import { describe, expect, it } from "vitest";
import { SessionManager } from "../SessionManager";
import { MemoryRunStore, MemorySessionStore, MemoryToolCallStore } from "../stores";
import {
  INTERRUPTED_TOOL_ERROR,
  parseCheckpoint,
  serializeCheckpoint,
  type AgentSession,
  type SessionSnapshot,
} from "../types";
import type { AgentMessage } from "../../types";

function message(id: string, role: AgentMessage["role"], content: string): AgentMessage {
  return { id, role, content, timestamp: 1 };
}

function snapshot(partial: Partial<SessionSnapshot> = {}): SessionSnapshot {
  return {
    messages: [
      message("u1", "user", "Add auth"),
      message("a1", "assistant", "I'll update login.ts"),
    ],
    toolCalls: [
      { id: "t1", tool: "write_file", input: { path: "login.ts" }, output: { ok: true }, status: "completed" },
      { id: "t2", tool: "run_command", input: { command: "pnpm test" }, status: "running" },
    ],
    currentTask: { id: "task-1", title: "Add auth", status: "running", progress: 40 },
    filesChanged: ["src/login.ts"],
    currentModel: "gpt-test",
    agentState: "tool_call",
    processJobs: [{ jobId: "job-1", command: "pnpm dev" }],
    runId: "run-1",
    ...partial,
  };
}

function createManager() {
  const sessions = new MemorySessionStore();
  const runs = new MemoryRunStore();
  const tools = new MemoryToolCallStore();
  return { manager: new SessionManager(sessions, runs, tools), sessions, runs, tools };
}

describe("SessionManager", () => {
  it("round-trips messages, tool pairs, filesChanged and state in checkpointJson", async () => {
    const { manager } = createManager();
    const session = await manager.ensureActive({
      conversationId: "conv-1",
      projectId: "proj-1",
      goal: "Add auth",
    });
    const snap = snapshot();
    await manager.snapshot(session.session.id, snap, { currentStep: "tool_call" });

    const loaded = await manager.get(session.session.id);
    expect(loaded?.checkpointJson).toBe(serializeCheckpoint(snap));
    const parsed = parseCheckpoint(loaded?.checkpointJson);
    expect(parsed?.messages.map((item) => item.content)).toEqual(["Add auth", "I'll update login.ts"]);
    expect(parsed?.toolCalls).toEqual(snap.toolCalls);
    expect(parsed?.filesChanged).toEqual(["src/login.ts"]);
    expect(parsed?.agentState).toBe("tool_call");
    expect(parsed?.processJobs).toEqual([{ jobId: "job-1", command: "pnpm dev" }]);
    expect(parsed?.currentTask?.title).toBe("Add auth");
  });

  it("recovers running sessions to interrupted and cancels in-flight tools only", async () => {
    const { manager, sessions, tools } = createManager();
    const snap = snapshot();
    const session: AgentSession = {
      id: "sess-1",
      projectId: "proj-1",
      conversationId: "conv-1",
      status: "running",
      startedAt: 1,
      updatedAt: 1,
      currentStep: "tool_call",
      currentGoal: "Add auth",
      checkpointJson: serializeCheckpoint(snap),
    };
    await sessions.upsert(session);
    await tools.upsert({
      id: "t2",
      agentRunId: "run-1",
      toolName: "run_command",
      status: "running",
      startedAt: 1,
    });
    await tools.upsert({
      id: "t1",
      agentRunId: "run-1",
      toolName: "write_file",
      status: "completed",
      startedAt: 1,
      finishedAt: 2,
    });

    const interrupted = await manager.recover("proj-1");
    expect(interrupted).toHaveLength(1);
    expect(interrupted[0]?.status).toBe("interrupted");

    const recovered = parseCheckpoint(interrupted[0]?.checkpointJson);
    expect(recovered?.toolCalls.find((call) => call.id === "t1")?.status).toBe("completed");
    expect(recovered?.toolCalls.find((call) => call.id === "t2")?.status).toBe("failed");
    expect((recovered?.toolCalls.find((call) => call.id === "t2")?.output as { error?: string }).error)
      .toBe(INTERRUPTED_TOOL_ERROR);

    const listed = await tools.list("run-1");
    expect(listed.find((call) => call.id === "t1")?.status).toBe("completed");
    expect(listed.find((call) => call.id === "t2")?.status).toBe("cancelled");
  });

  it("does not interrupt a finished turn left as running", async () => {
    const { manager, sessions } = createManager();
    await sessions.upsert({
      id: "sess-idle",
      projectId: "proj-1",
      conversationId: "conv-1",
      status: "running",
      startedAt: 1,
      updatedAt: 1,
      currentStep: "completed",
      currentGoal: "Add auth",
      checkpointJson: serializeCheckpoint(snapshot({
        toolCalls: [{ id: "t1", tool: "read_file", input: {}, status: "completed" }],
        agentState: "completed",
        processJobs: [],
      })),
    });
    const interrupted = await manager.recover("proj-1");
    expect(interrupted).toEqual([]);
    expect((await sessions.get("sess-idle"))?.status).toBe("completed");
  });
});
