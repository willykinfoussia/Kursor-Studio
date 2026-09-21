import { describe, expect, it, vi } from "vitest";
import type { AIService } from "../../AIService";
import { AgentRuntime } from "../../AgentRuntime";
import { AI_MODELS } from "../../config";
import { UsageMetrics } from "../../metrics";
import { allowAllGate } from "../../PermissionGate";
import { createManagerFromGate } from "../../PermissionManager";
import { ToolExecutor } from "../../ToolExecutor";
import { ToolRegistry, type AgentTool } from "../../ToolRegistry";
import { okResult } from "../../tools/result";
import { toolSchema } from "../../tools/schema";
import type { AgentEvent, AgentStream } from "../../types";
import { VerificationEngine } from "../../verification";
import { HookBus } from "../HookBus";
import { registerBuiltinHooks } from "../builtin";
import { parseHookYaml } from "../parseHook";

function textStream(text: string): AgentStream {
  return {
    events: (async function* (): AsyncGenerator<AgentEvent> {
      yield { type: "text-delta", messageId: "", text };
    })(),
  };
}

function mutateThenText(text: string): AgentStream {
  return {
    events: (async function* (): AsyncGenerator<AgentEvent> {
      yield { type: "tool-started", id: "t1", tool: "write_file", input: { path: "src/app.ts", content: "x" } };
      yield { type: "tool-completed", id: "t1", tool: "write_file", output: { ok: true, path: "src/app.ts" } };
      yield { type: "text-delta", messageId: "", text };
    })(),
  };
}

function runtimeSettings() {
  return {
    defaultModel: AI_MODELS[0].id,
    fallbackEnabled: false,
    modelOrder: AI_MODELS.map((model) => model.id),
    simulateFailureFor: [] as string[],
    automaticTools: true,
  };
}

function createFileExecutor(hooks: HookBus, execute: AgentTool["execute"]) {
  const registry = new ToolRegistry();
  registry.register({
    name: "read_file",
    description: "read",
    parameters: toolSchema({ path: { type: "string" } }, ["path"]),
    category: "filesystem",
    risk: "read",
    approval: "auto",
    capability: "filesystem.read",
    riskLevel: "low",
    timeoutMs: 50,
    mutate: false,
    execute,
  });
  return new ToolExecutor({
    registry,
    permissions: createManagerFromGate(allowAllGate, registry),
    getProjectRoot: () => "C:/Projects/App",
    hooks,
  });
}

function createCommandExecutor(hooks: HookBus, execute: AgentTool["execute"]) {
  const registry = new ToolRegistry();
  registry.register({
    name: "run_command",
    description: "run",
    parameters: toolSchema({ command: { type: "string" } }, ["command"]),
    category: "process",
    risk: "execute",
    approval: "auto",
    capability: "terminal.execute",
    riskLevel: "high",
    timeoutMs: 50,
    mutate: true,
    execute,
  });
  return new ToolExecutor({
    registry,
    permissions: createManagerFromGate(allowAllGate, registry),
    getProjectRoot: () => "C:/Projects/App",
    hooks,
  });
}

describe("safety hooks", () => {
  it("blocks protected .env paths from the builtin PreToolUse hook", async () => {
    const hooks = new HookBus();
    registerBuiltinHooks(hooks);
    let executed = false;
    const executor = createFileExecutor(hooks, async () => {
      executed = true;
      return okResult({ content: "SECRET" });
    });
    const denied = await executor.run("read_file", { path: ".env" });
    expect(denied.success).toBe(false);
    expect(denied.error?.code).toBe("hook_denied");
    expect(executed).toBe(false);
  });

  it("allows writing scaffold env files while still blocking secret reads", async () => {
    const hooks = new HookBus();
    registerBuiltinHooks(hooks);
    let executed = false;
    const registry = new ToolRegistry();
    registry.register({
      name: "write_file",
      description: "write",
      parameters: toolSchema({ path: { type: "string" } }, ["path"]),
      category: "filesystem",
      risk: "write",
      approval: "auto",
      capability: "filesystem.write",
      riskLevel: "medium",
      timeoutMs: 50,
      mutate: true,
      execute: async () => {
        executed = true;
        return okResult({ path: ".env.local" });
      },
    });
    const executor = new ToolExecutor({
      registry,
      permissions: createManagerFromGate(allowAllGate, registry),
      getProjectRoot: () => "C:/Projects/App",
      hooks,
    });
    const written = await executor.run("write_file", { path: "tinder-clone/.env.local" });
    expect(written.success).toBe(true);
    expect(executed).toBe(true);
  });

  it("blocks sudo rm -rf / on PreCommand without running a process", async () => {
    const hooks = new HookBus();
    registerBuiltinHooks(hooks);
    let executed = false;
    const executor = createCommandExecutor(hooks, async () => {
      executed = true;
      return okResult({ stdout: "nope" });
    });
    const denied = await executor.run("run_command", { command: "sudo rm -rf /" });
    expect(denied.success).toBe(false);
    expect(denied.error?.code).toBe("hook_denied");
    expect(executed).toBe(false);
  });

  it("rewrites the tool path when a hook returns modify metadata", async () => {
    const hooks = new HookBus();
    hooks.use({
      name: "rewrite-path",
      event: "before_tool",
      run: () => ({ result: "modify", metadata: { path: "src/ok.ts" } }),
    });
    let seen = "";
    const executor = createFileExecutor(hooks, async (input) => {
      seen = typeof input === "object" && input && "path" in input
        ? String((input as { path: string }).path)
        : "";
      return okResult({ path: seen });
    });
    const result = await executor.run("read_file", { path: "src/secret.ts" });
    expect(result.success).toBe(true);
    expect(seen).toBe("src/ok.ts");
  });

  it("emits hook-fired for warn and block", async () => {
    const traces: { hook: string; result: string }[] = [];
    const hooks = new HookBus({
      onTrace: (trace) => traces.push({ hook: trace.hook, result: trace.result }),
    });
    hooks.use({
      name: "careful",
      event: "before_tool",
      run: () => ({ result: "warn", message: "Be careful." }),
    });
    hooks.use({
      name: "block-env",
      event: "before_tool",
      run: (context) => context.path?.includes(".env")
        ? { result: "block", message: "No secrets." }
        : { result: "continue" },
    });
    const executor = createFileExecutor(hooks, async () => okResult({ content: "ok" }));
    await executor.run("read_file", { path: "src/app.ts" });
    await executor.run("read_file", { path: ".env" });
    expect(traces.some((trace) => trace.hook === "careful" && trace.result === "warn")).toBe(true);
    expect(traces.some((trace) => trace.hook === "block-env" && trace.result === "block")).toBe(true);
  });

  it("require-verification blocks Stop after an unverified mutation", async () => {
    const hooks = new HookBus();
    registerBuiltinHooks(hooks);
    const blocked = await hooks.emit({
      event: "before_completion",
      mutated: true,
      verificationOk: false,
      filesChanged: ["src/app.ts"],
    });
    expect(blocked.action).toBe("deny");
    const allowed = await hooks.emit({
      event: "before_completion",
      mutated: true,
      verificationOk: true,
    });
    expect(allowed.action).toBe("allow");
  });

  it("blocks UserPromptSubmit before the model is called", async () => {
    const hooks = new HookBus();
    hooks.use({
      name: "block-prompt",
      event: "user_prompt_submit",
      run: () => ({ result: "block", message: "Prompt blocked." }),
    });
    const streamChat = vi.fn(async () => textStream("should not run"));
    const runtime = new AgentRuntime({
      aiService: { streamChat } satisfies AIService,
      hooks,
      metrics: new UsageMetrics(),
      getSettings: runtimeSettings,
    });
    const events: AgentEvent[] = [];
    runtime.subscribe((event) => events.push(event));
    await runtime.sendMessage("hello there");
    expect(streamChat).toHaveBeenCalledTimes(0);
    expect(runtime.getState().status).toBe("failed");
    expect(events.some((event) => event.type === "hook-fired" && event.hook === "block-prompt" && event.result === "block")).toBe(true);
    expect(events.some((event) => event.type === "hook-denied" && event.event === "user_prompt_submit")).toBe(true);
  });

  it("does not run harness verification after a mutation outside a plan", async () => {
    const service: AIService = {
      async streamChat() {
        return mutateThenText("I think the tests pass.");
      },
    };
    const runtime = new AgentRuntime({
      aiService: service,
      metrics: new UsageMetrics(),
      verification: new VerificationEngine({ profile: { test: "pnpm test" } }),
      checkRunner: {
        async run() {
          return { exitCode: 1, stdout: "", stderr: "type error" };
        },
      },
      getSettings: runtimeSettings,
    });
    runtime.workflowSession.skipProcess = true;
    const events: AgentEvent[] = [];
    runtime.subscribe((event) => events.push(event));
    await runtime.sendMessage("fix the types");
    expect(events.some((event) => event.type === "verification-started")).toBe(false);
    expect(events.some((event) => event.type === "completed")).toBe(true);
    expect(runtime.getState().status).toBe("completed");
  });

  it("blocks Stop when plan-boundary verification fails", async () => {
    const service: AIService = {
      async streamChat() {
        return mutateThenText("I think the tests pass.");
      },
    };
    const runtime = new AgentRuntime({
      aiService: service,
      metrics: new UsageMetrics(),
      verification: new VerificationEngine({ profile: { test: "pnpm test" } }),
      checkRunner: {
        async run() {
          return { exitCode: 1, stdout: "", stderr: "type error" };
        },
      },
      getSettings: runtimeSettings,
    });
    runtime.workflowSession.skipProcess = true;
    runtime.workflowSession.approvePlan();
    runtime.workflowSession.setPlanTodosComplete(true);
    runtime.workflowSession.markSkillCheck("verification-before-completion");
    const events: AgentEvent[] = [];
    runtime.subscribe((event) => events.push(event));
    await runtime.sendMessage("fix the types");
    expect(events.some((event) => event.type === "verification-started")).toBe(true);
    expect(events.some((event) =>
      event.type === "hook-fired"
      && event.hook === "require-verification"
      && event.result === "block"
    )).toBe(true);
    expect(events.some((event) => event.type === "completed")).toBe(false);
    expect(runtime.getState().status).toBe("failed");
  });
});

describe("hook YAML aliases", () => {
  it("accepts PreToolUse as before_tool", async () => {
    const yaml = `name: block-env-alias
event: PreToolUse
when: { tool: read_file, pathContains: ".env" }
action: block
message: Reading .env is blocked by project hook.
`;
    expect(parseHookYaml(yaml, "alias.yml")?.event).toBe("before_tool");
    expect(parseHookYaml("event: UserPromptSubmit\naction: block", "p.yml")?.event).toBe("user_prompt_submit");
    expect(parseHookYaml("event: Stop\naction: block", "s.yml")?.event).toBe("before_completion");
    const hooks = new HookBus();
    await hooks.loadProjectHooks({
      readFile: async () => yaml,
      listDirectory: async () => [{ name: "alias.yml", path: ".kursor/hooks/alias.yml", kind: "file" }],
    });
    const executor = createFileExecutor(hooks, async () => okResult({ content: "SECRET" }));
    const denied = await executor.run("read_file", { path: ".env" });
    expect(denied.success).toBe(false);
    expect(denied.error?.code).toBe("hook_denied");
  });
});
