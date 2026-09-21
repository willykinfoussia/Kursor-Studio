import { describe, expect, it } from "vitest";
import { AgentLoop } from "../../AgentLoop";
import { AgentRuntime } from "../../AgentRuntime";
import { AI_MODELS } from "../../config";
import { ContextBuilder } from "../../ContextBuilder";
import { UsageMetrics } from "../../metrics";
import { PermissionManager } from "../../PermissionManager";
import { TaskGrantStore } from "../../permissions/grants";
import { RecoveryManager } from "../../recovery";
import { toolRegistry } from "../../ToolRegistry";
import type { AgentEvent, AgentMessage, AgentStream, AIRequestOptions } from "../../types";
import type { AIService } from "../../AIService";
import { AgentManager, type SpawnOptions } from "../AgentManager";
import { AgentOrchestrator, shouldOrchestrate } from "../AgentOrchestrator";
import { RESEARCH_AGENT } from "../builtin";
import { AgentBusyError, NestedAgentError } from "../errors";
import { deniedToolsFor, resolveDefinitionTools } from "../tools";
import { minPermissionMode } from "../types";
import { parseDelegateTrailer } from "../report";

const SIMPLE_GOAL = "renomme cette variable";
const MEDIUM_GOAL = "ajoute une fonction de filtrage dans le composant TodoList";
const INNER_MARK = "SECRET_CHILD_TRANSCRIPT_XYZ";

function textStream(text: string): AgentStream {
  return {
    events: (async function* (): AsyncGenerator<AgentEvent> {
      yield { type: "text-delta", messageId: "", text };
    })(),
  };
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
    id: () => "cp-orch",
    now: () => 1,
  });
}

function createRuntime(aiService: AIService) {
  return new AgentRuntime({
    aiService,
    metrics: new UsageMetrics(),
    recovery: silentRecovery(),
    getSettings: () => ({
      defaultModel: AI_MODELS[0].id,
      fallbackEnabled: true,
      modelOrder: AI_MODELS.map((model) => model.id),
      simulateFailureFor: [],
      automaticTools: true,
    }),
    getProjectRoot: () => null,
  });
}

function spawnOptions(overrides: Partial<SpawnOptions> = {}): SpawnOptions {
  return {
    parentKey: "parent-1",
    parentMode: "workspace-write" as const,
    models: AI_MODELS,
    fallbackEnabled: false,
    toolsEnabled: true,
    signal: new AbortController().signal,
    emit: () => undefined,
    setStatus: () => undefined,
    setActiveModel: () => undefined,
    getProjectRoot: () => null,
    ...overrides,
  };
}

describe("parseDelegateTrailer", () => {
  it("reads the JSON trailer and ignores surrounding text", () => {
    const parsed = parseDelegateTrailer(`${INNER_MARK}\n\`\`\`json\n{"summary":"Looked at the API","findings":["docs"],"issues":[]}\n\`\`\``);
    expect(parsed.summary).toBe("Looked at the API");
    expect(parsed.findings).toEqual(["docs"]);
  });
});

describe("specialist permissions", () => {
  it("denies write_file on Explore even when the parent has an allow-task grant", async () => {
    const parentGrants = new TaskGrantStore();
    parentGrants.add({
      id: "parent-grant",
      capability: "filesystem.write",
      scope: { kind: "project" },
      duration: "task",
      tool: "write_file",
    });
    const childGrants = new TaskGrantStore();
    const permissions = new PermissionManager({
      mode: minPermissionMode("full-access", RESEARCH_AGENT.permissionMode),
      confirmDestructive: false,
      registry: toolRegistry,
      getProjectRoot: () => "C:/Projects/TodoApp",
      grants: childGrants,
      deniedTools: deniedToolsFor(RESEARCH_AGENT, toolRegistry),
    });

    expect(permissions.grants).not.toBe(parentGrants);
    expect(await permissions.authorize("write_file", { path: "src/App.tsx" })).toBe("deny");
    expect(await permissions.authorize("read_file", { path: "src/App.tsx" })).toBe("allow");
  });

  it("reuses the same ToolRegistry instances", () => {
    const tools = resolveDefinitionTools(RESEARCH_AGENT, toolRegistry);
    expect(tools.find((tool) => tool.name === "read_file")).toBe(toolRegistry.get("read_file"));
    expect(tools.some((tool) => tool.name === "write_file")).toBe(false);
  });
});

describe("shouldOrchestrate", () => {
  it("never forks the parent loop on medium or complex goals", () => {
    expect(shouldOrchestrate("simple")).toBe(false);
    expect(shouldOrchestrate("medium")).toBe(false);
    expect(shouldOrchestrate("complex")).toBe(false);
  });
});

describe("AgentManager", () => {
  it("refuses a nested spawn from a subagent", () => {
    const loop = new AgentLoop({
      aiService: { streamChat: async () => textStream("ok") },
      metrics: new UsageMetrics(),
    });
    const manager = new AgentManager({
      loop,
      contextBuilder: new ContextBuilder(),
      registry: toolRegistry,
    });
    expect(() => manager.spawn("explore", spawnOptions({ fromSubagent: true }))).toThrow(NestedAgentError);
  });

  it("allows parallel explore agents and two implement agents", () => {
    const loop = new AgentLoop({
      aiService: { streamChat: async () => textStream("ok") },
      metrics: new UsageMetrics(),
    });
    const manager = new AgentManager({
      loop,
      contextBuilder: new ContextBuilder(),
      registry: toolRegistry,
    });
    manager.spawn("explore", spawnOptions({ instanceKey: "e1" }));
    manager.spawn("explore", spawnOptions({ instanceKey: "e2" }));
    expect(() => manager.spawn("implement", spawnOptions({ instanceKey: "i1" }))).not.toThrow();
    expect(() => manager.spawn("implement", spawnOptions({ instanceKey: "i2" }))).not.toThrow();
    expect(() => manager.spawn("implement", spawnOptions({ instanceKey: "i3" }))).toThrow(AgentBusyError);
  });
});

describe("AgentRuntime parent loop", () => {
  it("uses a single parent stream for a medium goal", async () => {
    const calls: string[] = [];
    const service: AIService = {
      async streamChat(_messages: AgentMessage[], options: AIRequestOptions) {
        calls.push(options.model);
        return textStream("ok");
      },
    };
    const runtime = createRuntime(service);
    const events: AgentEvent[] = [];
    runtime.subscribe((event) => events.push(event));
    await runtime.sendMessage(MEDIUM_GOAL);
    expect(calls).toHaveLength(1);
    expect(events.some((event) => event.type === "orchestration-started")).toBe(false);
    expect(events.filter((event) => event.type === "agent-started")).toHaveLength(0);
  });

  it("also uses a single parent stream for a simple goal", async () => {
    const calls: string[] = [];
    const service: AIService = {
      async streamChat(_messages, options) {
        calls.push(options.model);
        return textStream("renamed");
      },
    };
    const runtime = createRuntime(service);
    await runtime.sendMessage(SIMPLE_GOAL);
    expect(calls).toHaveLength(1);
  });
});

describe("AgentOrchestrator re-entry", () => {
  it("denies a nested orchestrator run", async () => {
    const loop = new AgentLoop({
      aiService: {
        async streamChat() {
          return textStream("ok");
        },
      },
      metrics: new UsageMetrics(),
    });
    const orchestrator = new AgentOrchestrator({
      loop,
      contextBuilder: new ContextBuilder(),
      registry: toolRegistry,
    });
    const base = spawnOptions();
    const first = orchestrator.run({
      ...base,
      goal: MEDIUM_GOAL,
      runId: "run-1",
      complexity: "medium",
    });
    await expect(orchestrator.run({
      ...base,
      goal: MEDIUM_GOAL,
      runId: "run-2",
      complexity: "medium",
    })).rejects.toBeInstanceOf(NestedAgentError);
    await first;
  });
});
