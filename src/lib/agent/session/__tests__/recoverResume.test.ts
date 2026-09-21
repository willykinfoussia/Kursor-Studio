import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AIService } from "../../AIService";
import { AgentRuntime } from "../../AgentRuntime";
import { AI_MODELS } from "../../config";
import { UsageMetrics } from "../../metrics";
import type { AgentEvent, AgentMessage, AgentStream, AIRequestOptions } from "../../types";
import { SessionManager } from "../SessionManager";
import { MemoryManager } from "../MemoryManager";
import { CompactionManager } from "../CompactionManager";
import { MemoryRunStore, MemorySessionStore, MemoryToolCallStore } from "../stores";
import { serializeCheckpoint, type SessionSnapshot } from "../types";
import { useAgentStore } from "../../../../stores/agentStore";

function textStream(text: string): AgentStream {
  return {
    events: (async function* (): AsyncGenerator<AgentEvent> {
      yield { type: "text-delta", messageId: "", text };
    })(),
  };
}

function hangingStream(started: () => void, signal?: AbortSignal): AgentStream {
  return {
    events: (async function* (): AsyncGenerator<AgentEvent> {
      yield { type: "text-delta", messageId: "", text: "…" };
      await new Promise<void>((_resolve, reject) => {
        const abort = () => reject(new DOMException("Cancelled", "AbortError"));
        if (signal?.aborted) {
          abort();
          return;
        }
        signal?.addEventListener("abort", abort, { once: true });
        started();
      });
    })(),
  };
}

function message(id: string, role: AgentMessage["role"], content: string): AgentMessage {
  return { id, role, content, timestamp: 1 };
}

function createHarness(aiService: AIService, killJob = vi.fn(async () => undefined)) {
  const sessions = new MemorySessionStore();
  const runs = new MemoryRunStore();
  const tools = new MemoryToolCallStore();
  const manager = new SessionManager(sessions, runs, tools);
  const processStart = vi.fn(async () => ({ jobId: "job-x", command: "pnpm dev" }));
  const runtime = new AgentRuntime({
    aiService,
    metrics: new UsageMetrics(),
    sessions: manager,
    compaction: new CompactionManager(),
    memory: new MemoryManager({
      saveStructured: async () => undefined,
      searchStructured: async () => [],
      indexSemantic: async () => undefined,
      searchSemantic: async () => [],
    }),
    killJob,
    getSettings: () => ({
      defaultModel: AI_MODELS[0]?.id ?? "model-1",
      fallbackEnabled: true,
      modelOrder: AI_MODELS.map((model) => model.id),
      simulateFailureFor: [],
      automaticTools: true,
    }),
    getConversationId: () => useAgentStore.getState().activeConversationId,
    getProjectId: () => "proj-1",
  });
  return { runtime, manager, sessions, runs, tools, killJob, processStart };
}

async function flush() {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

describe("recover, resume, cancel, process, hydrate", () => {
  beforeEach(() => {
    useAgentStore.getState().reset();
  });

  it("marks a cancelled generation as interrupted and stores a snapshot", async () => {
    let startedResolve: (() => void) | undefined;
    const started = new Promise<void>((resolve) => { startedResolve = resolve; });
    const service: AIService = {
      async streamChat(_messages: AgentMessage[], options: AIRequestOptions) {
        return hangingStream(() => startedResolve?.(), options.signal);
      },
    };
    const { runtime, manager } = createHarness(service);
    const events: AgentEvent[] = [];
    runtime.subscribe((event) => events.push(event));

    const request = runtime.sendMessage("long task");
    await started;
    runtime.cancel();
    await request.catch(() => undefined);
    await flush();

    expect(events.some((event) => event.type === "cancelled")).toBe(true);
    const active = manager.getActive();
    expect(active?.status).toBe("interrupted");
    expect(active?.checkpointJson).toBeTruthy();
    const snap = JSON.parse(active?.checkpointJson ?? "{}") as SessionSnapshot;
    expect(snap.messages.some((item) => item.content === "long task")).toBe(true);
    expect(useAgentStore.getState().interruptedSessions.some((session) => session.id === active?.id)).toBe(true);
  });

  it("recovers a crashed running session without replaying completed tools", async () => {
    const service: AIService = { streamChat: vi.fn(async () => textStream("ok")) };
    const { runtime, sessions, tools, processStart } = createHarness(service);
    const conversationId = useAgentStore.getState().activeConversationId;
    await sessions.upsert({
      id: "sess-crash",
      projectId: "proj-1",
      conversationId,
      status: "running",
      startedAt: 1,
      updatedAt: 1,
      currentStep: "tool_call",
      currentGoal: "Write login",
      checkpointJson: serializeCheckpoint({
        messages: [
          message("u1", "user", "Write login"),
          message("a1", "assistant", "Writing files"),
        ],
        toolCalls: [
          { id: "write", tool: "write_file", input: { path: "login.ts" }, output: { ok: true }, status: "completed" },
          { id: "cmd", tool: "run_command", input: { command: "pnpm test" }, status: "running" },
        ],
        currentTask: { id: "task", title: "Write login", status: "running", progress: 50 },
        filesChanged: ["login.ts"],
        currentModel: "gpt-test",
        agentState: "tool_call",
        processJobs: [{ jobId: "job-1", command: "pnpm dev" }],
        runId: "run-crash",
      }),
    });
    await tools.upsert({
      id: "write",
      agentRunId: "run-crash",
      toolName: "write_file",
      status: "completed",
      startedAt: 1,
      finishedAt: 2,
    });
    await tools.upsert({
      id: "cmd",
      agentRunId: "run-crash",
      toolName: "run_command",
      status: "running",
      startedAt: 3,
    });

    const interrupted = await runtime.recoverSession("proj-1");
    expect(interrupted).toHaveLength(1);
    expect(interrupted[0]?.status).toBe("interrupted");
    const recoveredTools = JSON.parse(interrupted[0]?.checkpointJson ?? "{}") as SessionSnapshot;
    expect(recoveredTools.toolCalls.find((call) => call.id === "write")?.status).toBe("completed");
    expect(recoveredTools.toolCalls.find((call) => call.id === "cmd")?.status).toBe("failed");
    expect((await tools.list("run-crash")).find((call) => call.id === "cmd")?.status).toBe("cancelled");
    expect(processStart).not.toHaveBeenCalled();
    expect(useAgentStore.getState().interruptedSessions).toHaveLength(1);
  });

  it("resumes a task from snapshot without replaying write or run_command", async () => {
    const startedTools: string[] = [];
    const service: AIService = {
      streamChat: vi.fn(async () => textStream("Continuing from the checkpoint.")),
    };
    const { runtime, sessions, killJob } = createHarness(service);
    const conversationId = useAgentStore.getState().activeConversationId;
    runtime.subscribe((event) => {
      if (event.type === "tool-started") startedTools.push(event.tool);
    });
    await sessions.upsert({
      id: "sess-resume",
      projectId: "proj-1",
      conversationId,
      status: "interrupted",
      startedAt: 1,
      updatedAt: 1,
      currentStep: "tool_call",
      currentGoal: "Write login",
      checkpointJson: serializeCheckpoint({
        messages: [
          message("u1", "user", "Write login"),
          message("a1", "assistant", "Writing files"),
        ],
        toolCalls: [
          { id: "write", tool: "write_file", input: { path: "login.ts" }, output: { ok: true }, status: "completed" },
          {
            id: "cmd",
            tool: "run_command",
            input: { command: "pnpm test" },
            status: "failed",
            output: { ok: false, error: "interrupted" },
          },
        ],
        currentTask: { id: "task", title: "Write login", status: "running", progress: 50 },
        filesChanged: ["login.ts"],
        currentModel: "gpt-test",
        agentState: "cancelled",
        processJobs: [{ jobId: "job-1", command: "pnpm dev" }],
        runId: "run-resume",
      }),
    });

    await runtime.resumeTask("sess-resume");
    await flush();

    expect(runtime.getState().messages.some((item) => item.content === "Write login")).toBe(true);
    expect(runtime.getState().messages.some((item) => item.content.includes("was interrupted"))).toBe(true);
    expect(useAgentStore.getState().filesChanged).toEqual(["login.ts"]);
    expect(startedTools).not.toContain("write_file");
    expect(startedTools).not.toContain("run_command");
    expect(startedTools).not.toContain("start_process");
    expect(killJob).not.toHaveBeenCalled();
  });

  it("does not start a snapshot process job when resuming after restart", async () => {
    const service: AIService = {
      streamChat: vi.fn(async () => textStream("No process restart.")),
    };
    const { runtime, sessions, processStart, killJob } = createHarness(service);
    const conversationId = useAgentStore.getState().activeConversationId;
    await sessions.upsert({
      id: "sess-job",
      projectId: "proj-1",
      conversationId,
      status: "running",
      startedAt: 1,
      updatedAt: 1,
      currentStep: "tool_call",
      currentGoal: "Start dev server",
      checkpointJson: serializeCheckpoint({
        messages: [message("u1", "user", "Start the app")],
        toolCalls: [
          { id: "p1", tool: "start_process", input: { command: "pnpm dev" }, status: "running" },
        ],
        currentTask: null,
        filesChanged: [],
        currentModel: "gpt-test",
        agentState: "tool_call",
        processJobs: [{ jobId: "job-1", command: "pnpm dev" }],
        runId: "run-job",
      }),
    });

    await runtime.recoverSession("proj-1");
    expect(killJob).not.toHaveBeenCalled();
    await runtime.resumeTask("sess-job");
    expect(processStart).not.toHaveBeenCalled();
    expect(runtime.getState().messages.some((item) => item.content.includes("start_process"))).toBe(true);
  });

  it("hydrates by recovering then resuming the interrupted task", async () => {
    const service: AIService = {
      streamChat: vi.fn(async () => textStream("Resumed after hydrate.")),
    };
    const { runtime, sessions } = createHarness(service);
    const conversationId = useAgentStore.getState().activeConversationId;
    useAgentStore.setState({
      messages: [message("u1", "user", "Write login")],
    });
    runtime.loadMessages(useAgentStore.getState().messages);
    await sessions.upsert({
      id: "sess-hydrate",
      projectId: "proj-1",
      conversationId,
      status: "running",
      startedAt: 1,
      updatedAt: 1,
      currentStep: "streaming",
      currentGoal: "Write login",
      checkpointJson: serializeCheckpoint({
        messages: [
          message("u1", "user", "Write login"),
          message("a1", "assistant", "Working"),
        ],
        toolCalls: [
          { id: "write", tool: "write_file", input: {}, status: "completed" },
        ],
        currentTask: { id: "task", title: "Write login", status: "running", progress: 10 },
        filesChanged: ["login.ts"],
        currentModel: "gpt-test",
        agentState: "streaming",
        processJobs: [],
        runId: "run-hydrate",
      }),
    });

    const interrupted = await runtime.recoverSession("proj-1");
    expect(interrupted[0]?.status).toBe("interrupted");
    await runtime.resumeTask("sess-hydrate");
    expect(runtime.getState().messages.some((item) => item.content === "Write login")).toBe(true);
    expect(runtime.getState().messages.some((item) => item.content === "Resumed after hydrate.")).toBe(true);
    expect(useAgentStore.getState().filesChanged).toEqual(["login.ts"]);
  });
});
