import { describe, expect, it, vi } from "vitest";
import { allowAllGate } from "../PermissionGate";
import { createManagerFromGate, PermissionManager } from "../PermissionManager";
import { ToolExecutor } from "../ToolExecutor";
import { ToolRegistry, type AgentTool } from "../ToolRegistry";
import { okResult } from "../tools/result";
import { toolSchema } from "../tools/schema";
import { WorkflowSessionState } from "../workflow/sessionState";
import { MIN_SUBAGENTS_REASON, PLAN_EXPLORE_REASON } from "../workflow/gates";

function createExecutor(tools: AgentTool[]) {
  const registry = new ToolRegistry();
  for (const tool of tools) registry.register(tool);
  return new ToolExecutor({
    registry,
    permissions: createManagerFromGate(allowAllGate, registry),
    getProjectRoot: () => "C:/Projects/TodoApp",
  });
}

function tool(partial: Partial<AgentTool> & Pick<AgentTool, "name" | "execute">): AgentTool {
  return {
    description: partial.name,
    parameters: toolSchema({
      path: { type: "string" },
      value: { type: "number" },
    }, partial.parameters?.required),
    category: "filesystem",
    risk: "read",
    approval: "auto",
    capability: "filesystem.read",
    riskLevel: "low",
    timeoutMs: partial.timeoutMs ?? 50,
    mutate: false,
    ...partial,
  };
}

describe("ToolExecutor", () => {
  it("rejects invalid input", async () => {
    const executor = createExecutor([tool({
      name: "read_file",
      parameters: toolSchema({ path: { type: "string" } }, ["path"]),
      execute: async () => okResult({}),
    })]);
    const result = await executor.run("read_file", {});
    expect(result.success).toBe(false);
    expect(result.error?.code).toBe("invalid_input");
  });

  it("times out when execute ignores the abort signal", async () => {
    const executor = createExecutor([tool({
      name: "slow",
      timeoutMs: 20,
      execute: async () => new Promise((resolve) => {
        setTimeout(() => resolve(okResult({})), 400);
      }),
    })]);
    const result = await executor.run("slow", {});
    expect(result.success).toBe(false);
    expect(result.error?.code).toBe("timeout");
    expect(result.durationMs).toBeGreaterThan(0);
  });

  it("cancels when the caller aborts", async () => {
    const controller = new AbortController();
    const executor = createExecutor([tool({
      name: "slow",
      timeoutMs: 5_000,
      execute: async (_input, ctx) => new Promise((resolve, reject) => {
        ctx.signal.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
      }),
    })]);
    const pending = executor.run("slow", {}, { signal: controller.signal });
    controller.abort("user-cancelled");
    const result = await pending;
    expect(result.success).toBe(false);
    expect(result.error?.code).toBe("cancelled");
  });

  it("rejects a malformed result", async () => {
    const executor = createExecutor([tool({
      name: "bad",
      execute: async () => "nope" as never,
    })]);
    const result = await executor.run("bad", {});
    expect(result.success).toBe(false);
    expect(result.error?.code).toBe("malformed_result");
  });

  it("rejects an unknown tool", async () => {
    const executor = createExecutor([]);
    const result = await executor.run("missing", {});
    expect(result.success).toBe(false);
    expect(result.error?.code).toBe("unknown_tool");
  });

  it("returns a successful result with duration", async () => {
    const executor = createExecutor([tool({
      name: "ok",
      execute: async () => okResult({ hello: true }),
    })]);
    const result = await executor.run("ok", {});
    expect(result.success).toBe(true);
    expect(result.data).toEqual({ hello: true });
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });

  it("does not execute when permission is denied", async () => {
    const execute = vi.fn(async () => okResult({}));
    const registry = new ToolRegistry();
    registry.register(tool({
      name: "write_file",
      capability: "filesystem.write",
      riskLevel: "medium",
      risk: "write",
      execute,
    }));
    const executor = new ToolExecutor({
      registry,
      permissions: new PermissionManager({
        mode: "read-only",
        confirmDestructive: true,
        registry,
        getProjectRoot: () => "C:/Projects/TodoApp",
      }),
      getProjectRoot: () => "C:/Projects/TodoApp",
    });
    const result = await executor.run("write_file", { path: "README.md" });
    expect(result.success).toBe(false);
    expect(result.error?.code).toBe("permission_denied");
    expect(result.error?.message).toMatch(/does not allow filesystem.write/);
    expect(execute).not.toHaveBeenCalled();
  });

  it("turns beforeExecute failures into tool errors", async () => {
    const execute = vi.fn(async () => okResult({}));
    const registry = new ToolRegistry();
    registry.register(tool({ name: "write_file", execute }));
    const executor = new ToolExecutor({
      registry,
      permissions: createManagerFromGate(allowAllGate, registry),
      getProjectRoot: () => "C:/Projects/TodoApp",
      beforeExecute: async () => {
        throw new RangeError("Maximum call stack size exceeded");
      },
    });
    const result = await executor.run("write_file", { path: "README.md" });
    expect(result.success).toBe(false);
    expect(result.error?.code).toBe("execution_failed");
    expect(result.error?.message).toContain("Maximum call stack size exceeded");
    expect(execute).not.toHaveBeenCalled();
  });

  it("normalizes ask_user_question XML extras before schema validation", async () => {
    let seen: unknown;
    const executor = createExecutor([tool({
      name: "ask_user_question",
      parameters: toolSchema({
        prompt: { type: "string" },
        options: { type: ["array", "string"] },
        kind: { type: "string" },
      }, ["prompt"]),
      execute: async (input) => {
        seen = input;
        return okResult({});
      },
    })]);
    const result = await executor.run("ask_user_question", {
      prompt: `Quel type d'application de boxe veux-tu créer ?</<arg_key>options</arg_key>\n<arg_value>[{"id":"workout","label":"Entraînement"},{"id":"game","label":"Jeu"}]`,
      arg_key: "options",
    });
    expect(result.success).toBe(true);
    expect(seen).toMatchObject({ prompt: "Quel type d'application de boxe veux-tu créer ?" });
    expect(seen).not.toHaveProperty("arg_key");
    expect((seen as { options: unknown[] }).options).toHaveLength(2);
  });

  it("stops the third consecutive identical tool call", async () => {
    const execute = vi.fn(async () => okResult({ ok: true }));
    const executor = createExecutor([tool({
      name: "run_command",
      parameters: toolSchema({ command: { type: "string" } }, ["command"]),
      execute,
    })]);
    const input = { command: "node -e console.log(1)" };
    expect((await executor.run("run_command", input)).success).toBe(true);
    expect((await executor.run("run_command", input)).success).toBe(true);
    const third = await executor.run("run_command", input);
    expect(third.success).toBe(false);
    expect(third.error?.code).toBe("repeated_command");
    expect(execute).toHaveBeenCalledTimes(2);
  });

  it("rejects a single agent spawn and allows a pair in the same step", async () => {
    const session = new WorkflowSessionState();
    session.skillCheckThisTurn = true;
    const registry = new ToolRegistry();
    registry.register(tool({
      name: "agent",
      mutate: false,
      timeoutMs: 5_000,
      parameters: toolSchema({
        description: { type: "string" },
        prompt: { type: "string" },
        subagent_type: { type: "string" },
      }, ["description", "prompt", "subagent_type"]),
      execute: async () => okResult({ agentId: "explore" }),
    }));
    const executor = new ToolExecutor({
      registry,
      permissions: createManagerFromGate(allowAllGate, registry),
      getProjectRoot: () => "C:/Projects/TodoApp",
      workflow: session,
    });
    const solo = await executor.run("agent", { description: "Research", prompt: "Look around", subagent_type: "explore" });
    expect(solo.success).toBe(false);
    expect(solo.error?.code).toBe("workflow_denied");
    expect(solo.error?.message).toBe(MIN_SUBAGENTS_REASON);

    const [first, second] = await Promise.all([
      executor.run("agent", { description: "KEEP map", prompt: "Find KEEP", subagent_type: "explore" }),
      executor.run("agent", { description: "EXTEND map", prompt: "Find EXTEND", subagent_type: "explore" }),
    ]);
    expect(first.success).toBe(true);
    expect(second.success).toBe(true);
  });

  it("allows create_plan in the same step as two explores started after it", async () => {
    const session = new WorkflowSessionState();
    session.skillCheckThisTurn = true;
    session.setInteractionMode("plan");
    session.markSkillCheck("writing-plans");
    session.markSkillCheck("subagent-driven-planning");
    const registry = new ToolRegistry();
    registry.register(tool({
      name: "create_plan",
      mutate: true,
      parameters: toolSchema({
        name: { type: "string" },
        todos: { type: "array", items: { type: "string" } },
      }, ["name", "todos"]),
      execute: async () => okResult({ created: true }),
    }));
    registry.register(tool({
      name: "agent",
      mutate: false,
      timeoutMs: 5_000,
      parameters: toolSchema({
        description: { type: "string" },
        prompt: { type: "string" },
        subagent_type: { type: "string" },
      }, ["description", "prompt", "subagent_type"]),
      execute: async () => {
        await new Promise((resolve) => setTimeout(resolve, 40));
        return okResult({ agentId: "explore" });
      },
    }));
    const executor = new ToolExecutor({
      registry,
      permissions: createManagerFromGate(allowAllGate, registry),
      getProjectRoot: () => "C:/Projects/TodoApp",
      workflow: session,
    });
    const [plan, exploreA, exploreB] = await Promise.all([
      executor.run("create_plan", { name: "x", todos: ["a"] }),
      executor.run("agent", { description: "Research KEEP", prompt: "Look around", subagent_type: "explore" }),
      executor.run("agent", { description: "Research EXTEND", prompt: "Look further", subagent_type: "explore" }),
    ]);
    expect(exploreA.success).toBe(true);
    expect(exploreB.success).toBe(true);
    expect(plan.success).toBe(true);
    expect(session.planExploreDone).toBe(true);
  });

  it("still denies create_plan when the step has only one explore", async () => {
    const session = new WorkflowSessionState();
    session.skillCheckThisTurn = true;
    session.setInteractionMode("plan");
    session.markSkillCheck("writing-plans");
    session.markSkillCheck("subagent-driven-planning");
    const registry = new ToolRegistry();
    registry.register(tool({
      name: "create_plan",
      mutate: true,
      parameters: toolSchema({
        name: { type: "string" },
        todos: { type: "array", items: { type: "string" } },
      }, ["name", "todos"]),
      execute: async () => okResult({ created: true }),
    }));
    registry.register(tool({
      name: "agent",
      mutate: false,
      timeoutMs: 5_000,
      parameters: toolSchema({
        description: { type: "string" },
        prompt: { type: "string" },
        subagent_type: { type: "string" },
      }, ["description", "prompt", "subagent_type"]),
      execute: async () => okResult({ agentId: "explore" }),
    }));
    const executor = new ToolExecutor({
      registry,
      permissions: createManagerFromGate(allowAllGate, registry),
      getProjectRoot: () => "C:/Projects/TodoApp",
      workflow: session,
    });
    const [plan, explore] = await Promise.all([
      executor.run("create_plan", { name: "x", todos: ["a"] }),
      executor.run("agent", { description: "Research", prompt: "Look around", subagent_type: "explore" }),
    ]);
    expect(explore.success).toBe(false);
    expect(explore.error?.message).toBe(MIN_SUBAGENTS_REASON);
    expect(plan.success).toBe(false);
    expect(plan.error?.message).toBe(PLAN_EXPLORE_REASON);
  });

  it("still denies create_plan when the step has no explore", async () => {
    const session = new WorkflowSessionState();
    session.skillCheckThisTurn = true;
    session.setInteractionMode("plan");
    session.markSkillCheck("writing-plans");
    session.markSkillCheck("subagent-driven-planning");
    const registry = new ToolRegistry();
    registry.register(tool({
      name: "create_plan",
      mutate: true,
      parameters: toolSchema({
        name: { type: "string" },
        todos: { type: "array", items: { type: "string" } },
      }, ["name", "todos"]),
      execute: async () => okResult({ created: true }),
    }));
    const executor = new ToolExecutor({
      registry,
      permissions: createManagerFromGate(allowAllGate, registry),
      getProjectRoot: () => "C:/Projects/TodoApp",
      workflow: session,
    });
    const plan = await executor.run("create_plan", { name: "x", todos: ["a"] });
    expect(plan.success).toBe(false);
    expect(plan.error?.code).toBe("workflow_denied");
    expect(plan.error?.message).toBe(PLAN_EXPLORE_REASON);
  });

  it("allows list_files in the same step as load_skill started after it", async () => {
    const session = new WorkflowSessionState();
    session.beginUserTurn("crée une application de sport");
    const registry = new ToolRegistry();
    registry.register(tool({
      name: "list_files",
      parameters: toolSchema({ path: { type: "string" } }),
      execute: async () => okResult({ path: "", entries: [] }),
    }));
    registry.register(tool({
      name: "load_skill",
      parameters: toolSchema({ skill: { type: "string" } }, ["skill"]),
      execute: async () => {
        await new Promise((resolve) => setTimeout(resolve, 40));
        return okResult({ skill: "brainstorming" });
      },
    }));
    const executor = new ToolExecutor({
      registry,
      permissions: createManagerFromGate(allowAllGate, registry),
      getProjectRoot: () => "C:/Projects/TodoApp",
      workflow: session,
    });
    const [listed, skill] = await Promise.all([
      executor.run("list_files", { path: "" }),
      executor.run("load_skill", { skill: "brainstorming" }),
    ]);
    expect(skill.success).toBe(true);
    expect(listed.success).toBe(true);
    expect(session.skillCheckThisTurn).toBe(true);
  });

  it("still denies list_files when the step has no skill check", async () => {
    const session = new WorkflowSessionState();
    session.beginUserTurn("crée une application de sport");
    const registry = new ToolRegistry();
    registry.register(tool({
      name: "list_files",
      parameters: toolSchema({ path: { type: "string" } }),
      execute: async () => okResult({ path: "", entries: [] }),
    }));
    const executor = new ToolExecutor({
      registry,
      permissions: createManagerFromGate(allowAllGate, registry),
      getProjectRoot: () => "C:/Projects/TodoApp",
      workflow: session,
    });
    const listed = await executor.run("list_files", { path: "" });
    expect(listed.success).toBe(false);
    expect(listed.error?.code).toBe("workflow_denied");
    expect(listed.error?.message).toMatch(/1% rule/);
  });
});
