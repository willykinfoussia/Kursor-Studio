import { describe, expect, it } from "vitest";
import { AgentRuntime } from "../AgentRuntime";
import { createCommandTool } from "../commandTool";
import { AI_MODELS } from "../config";
import { formatToolTranscript } from "../AgentExecutionContext";
import { AIProviderTimeoutError } from "../errors";
import { UsageMetrics } from "../metrics";
import { toolRegistry } from "../ToolRegistry";
import { idleToolContext } from "../tools/result";
import type { AIService } from "../AIService";
import type { AgentEvent, AgentMessage, AgentStream, AIRequestOptions } from "../types";

function textStream(text: string): AgentStream {
  return {
    events: (async function* (): AsyncGenerator<AgentEvent> {
      yield { type: "text-delta", messageId: "", text };
    })(),
  };
}

function createRuntime(aiService: AIService) {
  return new AgentRuntime({
    aiService,
    metrics: new UsageMetrics(),
    getSettings: () => ({
      defaultModel: AI_MODELS[0].id,
      fallbackEnabled: true,
      modelOrder: AI_MODELS.map((model) => model.id),
      simulateFailureFor: [],
      automaticTools: true,
    }),
  });
}

describe("AgentLoop", () => {
  it("runs read → read → write → run_command → final response without the harness engine outside a plan", async () => {
    expect(toolRegistry.get("run_command")?.name).toBe("run_command");
    const statuses: string[] = [];
    const service = {
      async streamChat() {
        return {
          events: (async function* (): AsyncGenerator<AgentEvent> {
            yield { type: "tool-started", id: "t1", tool: "read_file", input: { path: "src/App.tsx" } };
            yield { type: "tool-completed", id: "t1", tool: "read_file", output: { ok: true, path: "src/App.tsx", content: "app" } };
            yield { type: "tool-started", id: "t2", tool: "read_file", input: { path: "package.json" } };
            yield { type: "tool-completed", id: "t2", tool: "read_file", output: { ok: true, path: "package.json" } };
            yield { type: "tool-started", id: "t3", tool: "write_file", input: { path: "README.md", content: "Hi" } };
            yield { type: "tool-completed", id: "t3", tool: "write_file", output: { ok: true, path: "README.md" } };
            yield { type: "tool-started", id: "t4", tool: "run_command", input: { command: "pnpm --version" } };
            yield { type: "tool-completed", id: "t4", tool: "run_command", output: { ok: true, stdout: "10.0.0" } };
            yield { type: "text-delta", messageId: "", text: "Updated README and checked pnpm." };
          })(),
        };
      },
    };
    const runtime = createRuntime(service);
    const events: AgentEvent[] = [];
    runtime.subscribe((event) => {
      events.push(event);
      statuses.push(runtime.getState().status);
    });

    await runtime.sendMessage("write a short readme");

    const tools = events.filter((event) => event.type === "tool-started").map((event) => event.type === "tool-started" ? event.tool : "");
    expect(tools).toEqual(["read_file", "read_file", "write_file", "run_command"]);
    expect(events.some((event) => event.type === "verification-started")).toBe(false);
    expect(events.some((event) => event.type === "verification-completed")).toBe(false);
    expect(runtime.getState().status).toBe("completed");
    expect(runtime.getState().execution?.toolCalls).toHaveLength(4);
    expect(runtime.getState().execution?.steps.some((step) => step.kind === "verify")).toBe(false);
    expect(statuses).not.toContain("verifying");
    expect(runtime.getState().messages[runtime.getState().messages.length - 1]?.content).toBe("Updated README and checked pnpm.");
  });

  it("recovers from a tool failure and still completes", async () => {
    const service = {
      async streamChat() {
        return {
          events: (async function* (): AsyncGenerator<AgentEvent> {
            yield { type: "tool-started", id: "t1", tool: "write_file", input: { path: "README.md" } };
            yield { type: "tool-completed", id: "t1", tool: "write_file", output: { ok: false, error: "Unable to save file." } };
            yield { type: "tool-started", id: "t2", tool: "write_file", input: { path: "README.md", content: "Hi" } };
            yield { type: "tool-completed", id: "t2", tool: "write_file", output: { ok: true, path: "README.md" } };
            yield { type: "text-delta", messageId: "", text: "Recovered and wrote README.md." };
          })(),
        };
      },
    };
    const runtime = createRuntime(service);
    await runtime.sendMessage("write readme");

    const execution = runtime.getState().execution;
    expect(runtime.getState().status).toBe("completed");
    expect(execution?.toolCalls[0]?.status).toBe("failed");
    expect(execution?.toolCalls[1]?.status).toBe("completed");
    expect(execution?.steps.filter((step) => step.kind === "tool" && step.status === "failed")).toHaveLength(1);
  });

  it("cancels without falling back", async () => {
    let startedResolve: (() => void) | undefined;
    const started = new Promise<void>((resolve) => { startedResolve = resolve; });
    const calls: string[] = [];
    const service = {
      async streamChat(_messages: AgentMessage[], options: AIRequestOptions) {
        calls.push(options.model);
        return {
          events: (async function* (): AsyncGenerator<AgentEvent> {
            await new Promise<void>((_resolve, reject) => {
              const abort = () => reject(new DOMException("Cancelled", "AbortError"));
              if (options.signal?.aborted) {
                abort();
                return;
              }
              options.signal?.addEventListener("abort", abort, { once: true });
              startedResolve?.();
            });
          })(),
        };
      },
    };
    const runtime = createRuntime(service);
    const events: AgentEvent[] = [];
    runtime.subscribe((event) => events.push(event));

    const request = runtime.sendMessage("cancel me");
    await started;
    runtime.cancel();
    await request;

    expect(calls).toEqual([AI_MODELS[0].id]);
    expect(events.some((event) => event.type === "fallback")).toBe(false);
    expect(events[events.length - 1]?.type).toBe("cancelled");
    expect(runtime.getState().status).toBe("cancelled");
  });

  it("keeps tool results when falling back to another provider", async () => {
    const captured: AgentMessage[][] = [];
    const service = {
      async streamChat(messages: AgentMessage[], options: AIRequestOptions) {
        if (options.model === AI_MODELS[0].id) {
          return {
            events: (async function* (): AsyncGenerator<AgentEvent> {
              yield { type: "tool-started", id: "t1", tool: "read_file", input: { path: "src/App.tsx" } };
              yield { type: "tool-completed", id: "t1", tool: "read_file", output: { ok: true, path: "src/App.tsx", content: "app" } };
              throw new AIProviderTimeoutError();
            })(),
          };
        }
        captured.push(messages.map((message) => ({ ...message })));
        return textStream("continued after tools");
      },
    };
    const runtime = createRuntime(service);
    const events: AgentEvent[] = [];
    runtime.subscribe((event) => events.push(event));

    await runtime.sendMessage("inspect then continue");

    expect(events.some((event) => event.type === "fallback")).toBe(true);
    expect(runtime.getState().activeModel).toBe(AI_MODELS[1].id);
    expect(runtime.getState().execution?.toolCalls).toHaveLength(1);
    expect(runtime.getState().execution?.toolCalls[0]?.tool).toBe("read_file");
    const fallbackMessages = captured[0] ?? [];
    expect(fallbackMessages.some((message) => message.content.includes("read_file"))).toBe(true);
    expect(runtime.getState().messages[runtime.getState().messages.length - 1]?.content).toBe("continued after tools");
  });
});

describe("command tool", () => {
  it("runs through an injectable CommandRunner", async () => {
    const tool = createCommandTool({
      run: async (command) => ({
        command,
        stdout: "8.15.0",
        stderr: "",
        exitCode: 0,
      }),
    });
    const result = await tool.execute({ command: "pnpm --version" }, idleToolContext());
    expect(result.success).toBe(true);
    expect(result.data).toEqual({
      command: "pnpm --version",
      stdout: "8.15.0",
      stderr: "",
      exitCode: 0,
      truncated: false,
    });
  });
});

describe("tool transcript", () => {
  it("formats completed tool calls for fallback context", () => {
    const text = formatToolTranscript([
      { id: "t1", tool: "read_file", input: { path: "a.ts" }, output: { ok: true }, status: "completed" },
    ]);
    expect(text).toContain("read_file");
    expect(text).toContain("a.ts");
    expect(text).not.toContain("FAILED");
  });

  it("prefixes FAILED when create_plan returns success false", () => {
    const text = formatToolTranscript([
      {
        id: "t1",
        tool: "create_plan",
        input: { name: "Boxing" },
        output: {
          success: false,
          error: { code: "invalid_input", message: "body must include a section for each todo" },
        },
        status: "failed",
      },
    ]);
    expect(text).toContain("FAILED create_plan");
    expect(text).toContain("invalid_input");
  });
});
