import { describe, expect, it, vi } from "vitest";
import type { AIService } from "../AIService";
import { AgentRuntime, type AgentRuntimeDependencies } from "../AgentRuntime";
import { AI_MODELS } from "../config";
import { AIProviderError, AIProviderTimeoutError } from "../errors";
import { UsageMetrics } from "../metrics";
import { RecoveryManager } from "../recovery";
import type { AgentEvent, AgentMessage, AgentStream, AIRequestOptions } from "../types";
import { gitApi } from "../../tauri/githubApi";
import { projectApi } from "../../tauri/projectApi";

const MEDIUM_GOAL = "ajoute une fonction de filtrage dans le composant TodoList";

function textStream(text: string): AgentStream {
  return {
    events: (async function* (): AsyncGenerator<AgentEvent> {
      yield { type: "text-delta", messageId: "", text };
    })(),
  };
}

function createRuntime(aiService: AIService, extra: Partial<AgentRuntimeDependencies> = {}) {
  return new AgentRuntime({
    aiService,
    metrics: new UsageMetrics(),
    getSettings: extra.getSettings ?? (() => ({
      defaultModel: AI_MODELS[0].id,
      fallbackEnabled: true,
      modelOrder: AI_MODELS.map((model) => model.id),
      simulateFailureFor: [],
      automaticTools: true,
    })),
    ...extra,
  });
}

function silentRecovery() {
  return new RecoveryManager({
    files: {
      async readFile() {
        throw new Error("missing");
      },
      async writeFile() {},
      async delete() {},
    },
    git: {
      async isRepo() {
        return false;
      },
      async stashCreate() {
        return null;
      },
      async showPath() {
        return null;
      },
      async restorePaths() {},
    },
    id: () => "cp-1",
    now: () => 1,
  });
}

describe("AgentRuntime", () => {
  it("preserves conversation messages between requests", async () => {
    const requests: AgentMessage[][] = [];
    const service: AIService = {
      streamChat: vi.fn(async (messages) => {
        requests.push(messages.map((message: AgentMessage) => ({ ...message })));
        return textStream(`response-${requests.length}`);
      }),
    };
    const runtime = createRuntime(service);

    await runtime.sendMessage("first");
    await runtime.sendMessage("second");

    expect(requests[0].map((message) => message.content)).toEqual(["first"]);
    expect(requests[1].map((message) => message.content)).toEqual([
      "first",
      "response-1",
      "second",
    ]);
  });

  it("cancels the active model without triggering fallback", async () => {
    let startedResolve: (() => void) | undefined;
    const started = new Promise<void>((resolve) => { startedResolve = resolve; });
    const calls: string[] = [];
    const service: AIService = {
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

  it("falls back after a provider timeout", async () => {
    const calls: string[] = [];
    const service: AIService = {
      async streamChat(_messages, options) {
        calls.push(options.model);
        if (options.model === AI_MODELS[0].id) throw new AIProviderTimeoutError();
        return textStream("fallback worked");
      },
    };
    const runtime = createRuntime(service);
    const events: AgentEvent[] = [];
    runtime.subscribe((event) => events.push(event));

    await runtime.sendMessage("timeout test");

    expect(calls).toEqual([AI_MODELS[0].id, AI_MODELS[0].id, AI_MODELS[1].id]);
    expect(events.some((event) => event.type === "fallback")).toBe(true);
    expect(runtime.getState().activeModel).toBe(AI_MODELS[1].id);
  });

  it("uses the configured modelOrder for fallback", async () => {
    const calls: string[] = [];
    const service: AIService = {
      async streamChat(_messages, options) {
        calls.push(options.model);
        if (options.model === AI_MODELS[2].id) throw new AIProviderTimeoutError();
        return textStream("custom order");
      },
    };
    const runtime = new AgentRuntime({
      aiService: service,
      metrics: new UsageMetrics(),
      getSettings: () => ({
        defaultModel: AI_MODELS[2].id,
        fallbackEnabled: true,
        modelOrder: [AI_MODELS[2].id, AI_MODELS[1].id, AI_MODELS[0].id],
        simulateFailureFor: [],
        automaticTools: true,
      }),
    });

    await runtime.sendMessage("custom fallback");

    expect(calls).toEqual([AI_MODELS[2].id, AI_MODELS[2].id, AI_MODELS[1].id]);
    expect(runtime.getState().activeModel).toBe(AI_MODELS[1].id);
  });

  it("restores conversation history when loading messages", async () => {
    const service: AIService = {
      streamChat: vi.fn(async () => textStream("later")),
    };
    const runtime = createRuntime(service);
    await runtime.sendMessage("first");
    const history = runtime.getState().messages;
    runtime.reset();
    expect(runtime.getState().messages).toEqual([]);

    runtime.loadMessages(history);
    await runtime.sendMessage("second");

    expect(runtime.getState().messages.map((message) => message.content)).toEqual([
      "first",
      "later",
      "second",
      "later",
    ]);
  });

  it("completes when the model only uses tools", async () => {
    const service: AIService = {
      streamChat: async () => ({
        events: (async function* (): AsyncGenerator<AgentEvent> {
          yield { type: "tool-started", id: "t1", tool: "write_file", input: { path: "README.md" } };
          yield { type: "tool-completed", id: "t1", tool: "write_file", output: { ok: true, path: "README.md" } };
        })(),
      }),
    };
    const runtime = createRuntime(service);
    await runtime.sendMessage("create a readme");
    expect(runtime.getState().status).toBe("completed");
    expect(runtime.getState().messages[runtime.getState().messages.length - 1]?.content).toBe("Applied the requested file changes.");
  });

  it("skips a disk checkpoint for a simple rename", async () => {
    const service: AIService = {
      streamChat: vi.fn(async () => textStream("renamed")),
    };
    const recovery = silentRecovery();
    const create = vi.spyOn(recovery, "create");
    const runtime = createRuntime(service, { recovery });
    const events: AgentEvent[] = [];
    runtime.subscribe((event) => events.push(event));

    await runtime.sendMessage("renomme cette variable");

    expect(create).not.toHaveBeenCalled();
    expect(events.some((event) => event.type === "recovery-checkpoint")).toBe(false);
  });

  it("uses one canonical runId for workflow and model events", async () => {
    const service: AIService = {
      streamChat: vi.fn(async () => textStream("renamed")),
    };
    const runtime = createRuntime(service, { recovery: silentRecovery() });
    const events: AgentEvent[] = [];
    runtime.subscribe((event) => events.push(event));

    await runtime.sendMessage("renomme cette variable");

    const started = events.find((item) => item.type === "started");
    const workflow = events.find((item) => item.type === "workflow-started");
    expect(started?.type).toBe("started");
    expect(workflow?.type).toBe("workflow-started");
    if (started?.type === "started" && workflow?.type === "workflow-started") {
      expect(workflow.runId).toBe(started.requestId);
      expect(runtime.getRunId()).toBe(started.requestId);
      expect(workflow.goalKind).toBeDefined();
    }
    expect(events.some((item) => item.type === "task-started")).toBe(true);
  });

  it("creates a checkpoint for a medium task", async () => {
    const service: AIService = {
      streamChat: vi.fn(async () => textStream("ok")),
    };
    const recovery = silentRecovery();
    const create = vi.spyOn(recovery, "create");
    const runtime = createRuntime(service, { recovery });
    const events: AgentEvent[] = [];
    runtime.subscribe((event) => events.push(event));

    await runtime.sendMessage(MEDIUM_GOAL);

    expect(create).toHaveBeenCalledTimes(1);
    expect(events.some((event) => event.type === "recovery-checkpoint")).toBe(true);
    expect(events.some((event) => event.type === "recovery-available")).toBe(false);
  });

  it("offers recovery when a medium task fails and keeps the checkpoint on retry", async () => {
    const service: AIService = {
      streamChat: vi.fn(async () => {
        throw new AIProviderError("boom", { retryable: false });
      }),
    };
    const recovery = silentRecovery();
    const create = vi.spyOn(recovery, "create");
    const runtime = createRuntime(service, {
      recovery,
      getSettings: () => ({
        defaultModel: AI_MODELS[0].id,
        fallbackEnabled: false,
        modelOrder: [AI_MODELS[0].id],
        simulateFailureFor: [],
        automaticTools: true,
      }),
    });
    const events: AgentEvent[] = [];
    runtime.subscribe((event) => events.push(event));

    await runtime.sendMessage(MEDIUM_GOAL);

    expect(events.some((event) => event.type === "recovery-checkpoint")).toBe(true);
    expect(events.some((event) => event.type === "recovery-available")).toBe(true);
    expect(recovery.checkpoint?.id).toBe("cp-1");

    await runtime.retryRecovery();

    expect(create).toHaveBeenCalledTimes(1);
    expect(recovery.checkpoint?.id).toBe("cp-1");
  });

  it("checkouts the base branch then merges the agent branch", async () => {
    const status = vi.spyOn(projectApi, "gitStatus").mockResolvedValue({
      branch: "feat",
      changedFiles: [],
      clean: true,
    } as never);
    const checkout = vi.spyOn(gitApi, "checkout").mockResolvedValue(undefined);
    const mergeContinue = vi.spyOn(gitApi, "mergeContinue").mockRejectedValue(new Error("no merge"));
    const merge = vi.spyOn(gitApi, "merge").mockResolvedValue({
      merged: true,
      inProgress: false,
      conflicts: [],
      message: "Merged feat.",
    });
    const del = vi.spyOn(gitApi, "deleteBranch").mockResolvedValue(undefined);
    const push = vi.spyOn(gitApi, "push").mockResolvedValue(undefined);
    const runtime = createRuntime({ streamChat: vi.fn(async () => textStream("ok")) });
    runtime.workflowSession.agentBranch = { name: "feat", base: "main" };
    try {
      const result = await (runtime as unknown as {
        finishBranch: (input: { choice: "merge" }) => Promise<{ message: string; merged?: boolean }>;
      }).finishBranch({ choice: "merge" });
      expect(checkout).toHaveBeenCalledWith("main");
      expect(merge).toHaveBeenCalledWith("feat");
      expect(del).toHaveBeenCalledWith("feat", false);
      expect(push).toHaveBeenCalled();
      expect(del.mock.invocationCallOrder[0]).toBeLessThan(push.mock.invocationCallOrder[0]);
      expect(result.merged).toBe(true);
      expect(result.message).toContain("pushed");
      expect(runtime.workflowSession.agentBranch).toBeNull();
    } finally {
      status.mockRestore();
      checkout.mockRestore();
      mergeContinue.mockRestore();
      merge.mockRestore();
      del.mockRestore();
      push.mockRestore();
    }
  });

  it("returns conflict paths without deleting the feature branch", async () => {
    const status = vi.spyOn(projectApi, "gitStatus").mockResolvedValue({
      branch: "feat",
      changedFiles: [],
      clean: true,
    } as never);
    const mergeContinue = vi.spyOn(gitApi, "mergeContinue").mockRejectedValue(new Error("no merge"));
    const checkout = vi.spyOn(gitApi, "checkout").mockResolvedValue(undefined);
    const merge = vi.spyOn(gitApi, "merge").mockResolvedValue({
      merged: false,
      inProgress: true,
      conflicts: ["src/App.tsx"],
      message: "Merge conflicts in src/App.tsx.",
    });
    const del = vi.spyOn(gitApi, "deleteBranch").mockResolvedValue(undefined);
    const push = vi.spyOn(gitApi, "push").mockResolvedValue(undefined);
    const runtime = createRuntime({ streamChat: vi.fn(async () => textStream("ok")) });
    runtime.workflowSession.agentBranch = { name: "feat", base: "main" };
    const events: AgentEvent[] = [];
    runtime.subscribe((event) => events.push(event));
    try {
      const result = await (runtime as unknown as {
        finishBranch: (input: { choice: "merge" }) => Promise<{ message: string; conflicts?: string[] }>;
      }).finishBranch({ choice: "merge" });
      expect(result.conflicts).toEqual(["src/App.tsx"]);
      expect(del).not.toHaveBeenCalled();
      expect(push).not.toHaveBeenCalled();
      expect(runtime.workflowSession.agentBranch).toEqual({ name: "feat", base: "main" });
      expect(events.some((event) => event.type === "merge-conflicts")).toBe(true);
    } finally {
      status.mockRestore();
      mergeContinue.mockRestore();
      checkout.mockRestore();
      merge.mockRestore();
      del.mockRestore();
      push.mockRestore();
    }
  });

  it("continues an in-progress merge without checking out again", async () => {
    const mergeContinue = vi.spyOn(gitApi, "mergeContinue").mockResolvedValue({
      merged: true,
      inProgress: false,
      conflicts: [],
      message: "Merge continued.",
    });
    const checkout = vi.spyOn(gitApi, "checkout").mockResolvedValue(undefined);
    const merge = vi.spyOn(gitApi, "merge").mockResolvedValue({
      merged: true,
      inProgress: false,
      conflicts: [],
      message: "Merged feat.",
    });
    const del = vi.spyOn(gitApi, "deleteBranch").mockResolvedValue(undefined);
    const push = vi.spyOn(gitApi, "push").mockResolvedValue(undefined);
    const runtime = createRuntime({ streamChat: vi.fn(async () => textStream("ok")) });
    runtime.workflowSession.agentBranch = { name: "feat", base: "main" };
    try {
      const result = await (runtime as unknown as {
        finishBranch: (input: { choice: "merge" }) => Promise<{ message: string; merged?: boolean }>;
      }).finishBranch({ choice: "merge" });
      expect(mergeContinue).toHaveBeenCalled();
      expect(checkout).not.toHaveBeenCalled();
      expect(merge).not.toHaveBeenCalled();
      expect(del).toHaveBeenCalledWith("feat", false);
      expect(push).toHaveBeenCalled();
      expect(result.merged).toBe(true);
      expect(result.message).toContain("pushed");
    } finally {
      mergeContinue.mockRestore();
      checkout.mockRestore();
      merge.mockRestore();
      del.mockRestore();
      push.mockRestore();
    }
  });

  it("creates git_branch in the open checkout and records agentBranch", async () => {
    const status = vi.spyOn(projectApi, "gitStatus").mockResolvedValue({
      branch: "main",
      changedFiles: [],
      clean: true,
    } as never);
    const createBranch = vi.spyOn(gitApi, "createBranch").mockResolvedValue(undefined);
    const runtime = createRuntime({ streamChat: vi.fn(async () => textStream("ok")) });
    const events: AgentEvent[] = [];
    runtime.subscribe((event) => events.push(event));
    try {
      const result = await (runtime as unknown as {
        ensureAgentBranch: (input: { action: "create"; branch?: string }) => Promise<{ message: string; branch?: string; base?: string }>;
      }).ensureAgentBranch({ action: "create", branch: "kursor-x" });
      expect(createBranch).toHaveBeenCalledWith("kursor-x");
      expect(result.branch).toBe("kursor-x");
      expect(result.base).toBe("main");
      expect(runtime.workflowSession.agentBranch).toEqual({ name: "kursor-x", base: "main" });
      expect(events.some((event) => event.type === "branch-created")).toBe(true);
    } finally {
      status.mockRestore();
      createBranch.mockRestore();
    }
  });

  it("refuses git_branch create on a dirty tree", async () => {
    const status = vi.spyOn(projectApi, "gitStatus").mockResolvedValue({
      branch: "main",
      changedFiles: ["src/a.ts"],
      clean: false,
    } as never);
    const createBranch = vi.spyOn(gitApi, "createBranch").mockResolvedValue(undefined);
    const runtime = createRuntime({ streamChat: vi.fn(async () => textStream("ok")) });
    try {
      const result = await (runtime as unknown as {
        ensureAgentBranch: (input: { action: "create"; branch?: string }) => Promise<{ message: string }>;
      }).ensureAgentBranch({ action: "create", branch: "kursor-x" });
      expect(result.message).toMatch(/dirty/i);
      expect(result.message).toMatch(/git_commit/);
      expect(result.message).toMatch(/git_push/);
      expect(result.message).toMatch(/Do not stash/);
      expect(createBranch).not.toHaveBeenCalled();
      expect(runtime.workflowSession.agentBranch).toBeNull();
    } finally {
      status.mockRestore();
      createBranch.mockRestore();
    }
  });

  it("refuses git_branch create when .kursor plan files are uncommitted", async () => {
    const status = vi.spyOn(projectApi, "gitStatus").mockResolvedValue({
      branch: "main",
      changedFiles: [".kursor/plans/sport.plan.md"],
      clean: false,
    } as never);
    const createBranch = vi.spyOn(gitApi, "createBranch").mockResolvedValue(undefined);
    const runtime = createRuntime({ streamChat: vi.fn(async () => textStream("ok")) });
    try {
      const result = await (runtime as unknown as {
        ensureAgentBranch: (input: { action: "create"; branch?: string }) => Promise<{ message: string }>;
      }).ensureAgentBranch({ action: "create", branch: "kursor-x" });
      expect(result.message).toMatch(/\.kursor\/plans\/sport\.plan\.md/);
      expect(result.message).toMatch(/git_commit/);
      expect(createBranch).not.toHaveBeenCalled();
      expect(runtime.workflowSession.agentBranch).toBeNull();
    } finally {
      status.mockRestore();
      createBranch.mockRestore();
    }
  });

  it("skips git_branch create when already on the session agent branch", async () => {
    const status = vi.spyOn(projectApi, "gitStatus").mockResolvedValue({
      branch: "kursor-x",
      changedFiles: [],
      clean: true,
    } as never);
    const createBranch = vi.spyOn(gitApi, "createBranch").mockResolvedValue(undefined);
    const runtime = createRuntime({ streamChat: vi.fn(async () => textStream("ok")) });
    runtime.workflowSession.agentBranch = { name: "kursor-x", base: "main" };
    try {
      const result = await (runtime as unknown as {
        ensureAgentBranch: (input: { action: "create"; branch?: string }) => Promise<{ message: string; branch?: string }>;
      }).ensureAgentBranch({ action: "create", branch: "kursor-x" });
      expect(createBranch).not.toHaveBeenCalled();
      expect(result.message).toMatch(/Already on implementation branch/);
    } finally {
      status.mockRestore();
      createBranch.mockRestore();
    }
  });
});
