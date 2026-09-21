import { describe, expect, it } from "vitest";
import { PermissionManager } from "../PermissionManager";
import { toolPermission } from "../permissions/meta";
import type { ApprovalRequest, Capability, RiskLevel } from "../permissions/types";
import { ToolRegistry, type AgentTool } from "../ToolRegistry";
import { okResult } from "../tools/result";
import { toolSchema } from "../tools/schema";

function stubTool(name: string, capability: Capability, riskLevel: RiskLevel): AgentTool {
  return {
    name,
    description: name,
    ...toolPermission(capability, riskLevel),
    parameters: toolSchema({
      path: { type: "string" },
      command: { type: "string" },
      url: { type: "string" },
    }),
    timeoutMs: 1_000,
    mutate: true,
    execute: async () => okResult({}),
  };
}

function manager(tools: AgentTool[], extras: Partial<ConstructorParameters<typeof PermissionManager>[0]> = {}) {
  const registry = new ToolRegistry();
  for (const tool of tools) registry.register(tool);
  return new PermissionManager({
    mode: "workspace-write",
    confirmDestructive: true,
    registry,
    getProjectRoot: () => "C:/Projects/TodoApp",
    ...extras,
  });
}

describe("ApprovalRequest", () => {
  const del = stubTool("delete_file", "filesystem.delete", "high");
  const run = stubTool("run_command", "terminal.execute", "high");
  const start = stubTool("start_process", "terminal.long_running", "critical");
  const fetch = stubTool("fetch_url", "network.fetch", "medium");

  it("emits a rich approval request", async () => {
    let request: ApprovalRequest | undefined;
    const permissions = manager([start], {
      onAsk: (next) => {
        request = next;
      },
      prompter: { async prompt(next) { return next.id ? "deny" : "deny"; } },
    });
    await permissions.authorize("start_process", { command: "pnpm test" }, "call-1");
    expect(request).toMatchObject({
      id: "call-1",
      tool: "start_process",
      reason: expect.stringContaining("terminal.long_running"),
      riskLevel: "critical",
      capability: "terminal.long_running",
      mode: "workspace-write",
      scope: { kind: "commands", families: ["pnpm"] },
    });
  });

  it("auto-allows captured project commands in workspace-write", async () => {
    let asked = 0;
    const permissions = manager([run], {
      prompter: {
        async prompt() {
          asked += 1;
          return "deny";
        },
      },
    });
    expect(permissions.needsPrompt("run_command", { command: "pnpm test" })).toBe(false);
    expect(await permissions.authorize("run_command", { command: "npx create-next-app" })).toBe("allow");
    expect(asked).toBe(0);
  });

  it("replays allow-task for the same command family", async () => {
    const asked: string[] = [];
    const permissions = manager([start], {
      prompter: {
        async prompt(request) {
          asked.push(request.id);
          return "allow-task";
        },
      },
    });
    expect(await permissions.authorize("start_process", { command: "pnpm test" }, "task-1")).toBe("allow");
    expect(await permissions.authorize("start_process", { command: "pnpm lint" }, "task-2")).toBe("allow");
    expect(asked).toEqual(["task-1"]);
    expect(permissions.grants.list()).toHaveLength(1);
  });

  it("replays allow-permanent after task grants are cleared", async () => {
    const asked: string[] = [];
    const persisted: Array<{ tool?: string }> = [];
    const permissions = manager([start], {
      onPermanentGrant: (rule) => {
        persisted.push(rule);
      },
      prompter: {
        async prompt(request) {
          asked.push(request.id);
          return "allow-permanent";
        },
      },
    });
    expect(await permissions.authorize("start_process", { command: "pnpm test" }, "perm-1")).toBe("allow");
    expect(await permissions.authorize("start_process", { command: "pnpm lint" }, "perm-2")).toBe("allow");
    expect(asked).toEqual(["perm-1"]);
    permissions.grants.clear();
    expect(permissions.needsPrompt("start_process", { command: "pnpm typecheck" })).toBe(false);
    expect(await permissions.authorize("start_process", { command: "pnpm typecheck" }, "perm-3")).toBe("allow");
    expect(asked).toEqual(["perm-1"]);
    expect(persisted).toEqual([expect.objectContaining({
      action: "allow",
      tool: "start_process",
      capability: "terminal.long_running",
      scope: { kind: "commands", families: ["pnpm"] },
    })]);
  });

  it("honors persisted allow rules without prompting", async () => {
    const asked: string[] = [];
    const permissions = manager([run], {
      allowRules: [{
        action: "allow",
        tool: "run_command",
        capability: "terminal.execute",
        scope: { kind: "commands", families: ["pnpm"] },
      }],
      prompter: {
        async prompt(request) {
          asked.push(request.id);
          return "deny";
        },
      },
    });
    expect(permissions.needsPrompt("run_command", { command: "pnpm test" })).toBe(false);
    expect(await permissions.authorize("run_command", { command: "pnpm test" })).toBe("allow");
    expect(asked).toEqual([]);
  });

  it("skips prompts in yolo mode", async () => {
    let asked = 0;
    const permissions = manager([run], {
      yoloMode: true,
      prompter: {
        async prompt() {
          asked += 1;
          return "deny";
        },
      },
    });
    expect(permissions.needsPrompt("run_command", { command: "pnpm test" })).toBe(false);
    expect(await permissions.authorize("run_command", { command: "pnpm test" })).toBe("allow");
    expect(asked).toBe(0);
  });

  it("keeps hard denies in yolo mode", async () => {
    const read = stubTool("read_file", "filesystem.read", "low");
    const permissions = manager([run, read], { yoloMode: true });
    expect(await permissions.authorize("run_command", { command: "sudo ls" })).toBe("deny");
    expect(await permissions.authorize("read_file", { path: ".env" })).toBe("deny");
  });

  it("covers the same path scope until the end of the run", async () => {
    const asked: string[] = [];
    const permissions = manager([del], {
      prompter: {
        async prompt(request) {
          asked.push(String((request.input as { path?: string }).path));
          return "allow-task";
        },
      },
    });
    expect(await permissions.authorize("delete_file", { path: "src/App.tsx" })).toBe("allow");
    expect(await permissions.authorize("delete_file", { path: "src/lib/agent.ts" })).toBe("allow");
    expect(await permissions.authorize("delete_file", { path: "README.md" })).toBe("allow");
    expect(asked).toEqual(["src/App.tsx", "README.md"]);
    expect(permissions.grants.list()).toHaveLength(2);
  });

  it("covers command families and domains for the task", async () => {
    const asked: string[] = [];
    const permissions = manager([start, fetch], {
      prompter: {
        async prompt(request) {
          asked.push(`${request.tool}:${request.scope.kind}`);
          return "allow-task";
        },
      },
    });
    expect(await permissions.authorize("start_process", { command: "pnpm test" })).toBe("allow");
    expect(await permissions.authorize("start_process", { command: "pnpm lint" })).toBe("allow");
    expect(await permissions.authorize("start_process", { command: "cargo test" })).toBe("allow");
    expect(await permissions.authorize("fetch_url", { url: "https://docs.rs/tauri" })).toBe("allow");
    expect(await permissions.authorize("fetch_url", { url: "https://docs.rs/serde" })).toBe("allow");
    expect(await permissions.authorize("fetch_url", { url: "https://example.com" })).toBe("allow");
    expect(asked).toEqual(["start_process:commands", "start_process:commands", "fetch_url:domains", "fetch_url:domains"]);
  });

  it("clears task grants at the end of a run", async () => {
    const permissions = manager([start], {
      prompter: { async prompt() { return "allow-task"; } },
    });
    expect(await permissions.authorize("start_process", { command: "pnpm test" })).toBe("allow");
    permissions.grants.clear();
    expect(permissions.needsPrompt("start_process", { command: "pnpm test" })).toBe(true);
  });
});
