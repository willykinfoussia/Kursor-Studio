import { describe, expect, it } from "vitest";
import { allowAllGate } from "../PermissionGate";
import { PermissionManager, sessionModeFromSettings } from "../PermissionManager";
import { toolPermission } from "../permissions/meta";
import type { Capability, PermissionMode, RiskLevel } from "../permissions/types";
import { createBuiltinTools } from "../registerBuiltinTools";
import { TaskGrantStore } from "../permissions/grants";
import { applySkillToolGrants } from "../skills/invokeSkill";
import { parseSkill } from "../skills/parseSkill";
import { ToolRegistry, type AgentTool } from "../ToolRegistry";
import { failResult, idleToolContext, okResult } from "../tools/result";
import { toolSchema } from "../tools/schema";

function stubTool(
  name: string,
  capability: Capability,
  riskLevel: RiskLevel,
  extra: Partial<AgentTool> = {},
): AgentTool {
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
    mutate: capability !== "filesystem.read" && capability !== "git.read",
    execute: async () => okResult({}),
    ...extra,
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

describe("PermissionManager", () => {
  const read = stubTool("read_file", "filesystem.read", "low");
  const write = stubTool("write_file", "filesystem.write", "medium");
  const del = stubTool("delete_file", "filesystem.delete", "high");
  const run = stubTool("run_command", "terminal.execute", "high");
  const start = stubTool("start_process", "terminal.long_running", "critical");
  const kill = stubTool("kill_process", "applications.execute", "high");
  const fetch = stubTool("fetch_url", "network.fetch", "medium");
  const search = stubTool("web_search", "network.search", "medium");
  const git = stubTool("git_status", "git.read", "low");
  const catalog = [read, write, del, run, start, kill, fetch, search, git];

  it("maps automaticTools and permissionMode", () => {
    expect(sessionModeFromSettings(true)).toBe("workspace-write");
    expect(sessionModeFromSettings(false)).toBe("read-only");
    expect(sessionModeFromSettings(false, "full-access")).toBe("full-access");
    expect(sessionModeFromSettings(true, "ask")).toBe("workspace-write");
  });

  it("denies unknown tools, denied tools, protected paths, and path escapes", async () => {
    const permissions = manager([read, write], { deniedTools: ["write_file"] });
    expect(await permissions.authorize("missing", {})).toBe("deny");
    expect(await permissions.authorize("write_file", { path: "README.md" })).toBe("deny");
    expect(await permissions.authorize("read_file", { path: ".env" })).toBe("deny");
    expect(await permissions.authorize("write_file", { path: "../secret.txt" })).toBe("deny");
  });

  it("asks for destructive and execute tools in workspace-write, allows reads and writes", async () => {
    const asked: string[] = [];
    const permissions = manager([read, write, del, run], {
      prompter: {
        async prompt(request) {
          asked.push(request.tool);
          return "allow-task";
        },
      },
    });
    expect(await permissions.authorize("read_file", { path: "src/App.tsx" })).toBe("allow");
    expect(await permissions.authorize("write_file", { path: "README.md" })).toBe("allow");
    expect(await permissions.authorize("delete_file", { path: "tmp.txt" })).toBe("allow");
    expect(await permissions.authorize("run_command", { command: "pnpm test" })).toBe("allow");
    expect(asked).toEqual(["delete_file"]);
  });

  it("allows once without creating a task grant", async () => {
    const permissions = manager([start], {
      prompter: { async prompt() { return "allow-once"; } },
    });
    expect(await permissions.authorize("start_process", { command: "pnpm test" })).toBe("allow");
    expect(permissions.grants.list()).toEqual([]);
    expect(permissions.needsPrompt("start_process", { command: "pnpm lint" })).toBe(true);
  });

  it("applies the mode × capability matrix", async () => {
    const cases: Array<[PermissionMode, string, unknown, "allow" | "deny" | "ask"]> = [
      ["read-only", "read_file", { path: "src/App.tsx" }, "allow"],
      ["read-only", "git_status", {}, "allow"],
      ["read-only", "write_file", { path: "README.md" }, "deny"],
      ["read-only", "run_command", { command: "pnpm test" }, "deny"],
      ["read-only", "fetch_url", { url: "https://docs.rs" }, "ask"],
      ["workspace-write", "write_file", { path: "src/App.tsx" }, "allow"],
      ["workspace-write", "run_command", { command: "pnpm test" }, "allow"],
      ["workspace-write", "start_process", { command: "pnpm dev" }, "ask"],
      ["workspace-write", "web_search", { query: "tauri" }, "ask"],
      ["full-access", "run_command", { command: "pnpm test" }, "allow"],
      ["full-access", "fetch_url", { url: "https://docs.rs" }, "allow"],
      ["full-access", "kill_process", { jobId: "job-1" }, "allow"],
    ];

    for (const [mode, tool, input, expected] of cases) {
      const permissions = manager(catalog, { mode, confirmDestructive: true });
      if (expected === "ask") {
        expect(permissions.needsPrompt(tool, input), `${mode} ${tool}`).toBe(true);
        expect(await permissions.authorize(tool, input), `${mode} ${tool}`).toBe("deny");
        continue;
      }
      expect(permissions.needsPrompt(tool, input), `${mode} ${tool}`).toBe(false);
      expect(await permissions.authorize(tool, input), `${mode} ${tool}`).toBe(expected);
    }
  });

  it("keeps hard denies in full-access", async () => {
    const permissions = manager(catalog, { mode: "full-access" });
    expect(await permissions.authorize("read_file", { path: ".env" })).toBe("deny");
    expect(await permissions.authorize("write_file", { path: ".env.local" })).toBe("allow");
    expect(await permissions.authorize("read_file", { path: ".env.example" })).toBe("allow");
    expect(await permissions.authorize("write_file", { path: "../secret.txt" })).toBe("deny");
    expect(await permissions.authorize("run_command", { command: "sudo ls" })).toBe("deny");
  });

  it("matches scoped deny and ask rules", async () => {
    const permissions = manager([write, run, fetch], {
      mode: "full-access",
      denyRules: [{ action: "deny", capability: "filesystem.write", scope: { kind: "paths", prefixes: ["secrets"] } }],
      askRules: [{ action: "ask", capability: "terminal.execute", scope: { kind: "commands", families: ["cargo"] } }],
      prompter: { async prompt() { return "allow-task"; } },
    });
    expect(await permissions.authorize("write_file", { path: "secrets/token.txt" })).toBe("deny");
    expect(await permissions.authorize("write_file", { path: "src/App.tsx" })).toBe("allow");
    expect(permissions.needsPrompt("run_command", { command: "cargo test" })).toBe(true);
    expect(await permissions.authorize("run_command", { command: "cargo test" })).toBe("allow");
  });

  it("denies without a prompter", async () => {
    const permissions = manager([start], { mode: "workspace-write" });
    expect(await permissions.authorize("start_process", { command: "pnpm test" })).toBe("deny");
  });

  it("can wrap an allow-all gate", async () => {
    const permissions = manager([run], { gate: allowAllGate });
    expect(await permissions.authorize("run_command", { command: "sudo rm" })).toBe("allow");
  });

  it("maps builtin tools to capabilities and risk levels", () => {
    const tools = createBuiltinTools({
      fs: {} as never,
      process: {} as never,
      git: {} as never,
      http: {} as never,
    });
    const map = Object.fromEntries(tools.map((tool) => [tool.name, {
      capability: tool.capability,
      riskLevel: tool.riskLevel,
    }]));
    expect(map.list_files).toEqual({ capability: "filesystem.read", riskLevel: "low" });
    expect(map.read_file).toEqual({ capability: "filesystem.read", riskLevel: "low" });
    expect(map.search_files).toEqual({ capability: "filesystem.read", riskLevel: "low" });
    expect(map.write_file).toEqual({ capability: "filesystem.write", riskLevel: "medium" });
    expect(map.create_file).toEqual({ capability: "filesystem.write", riskLevel: "medium" });
    expect(map.create_directory).toEqual({ capability: "filesystem.write", riskLevel: "medium" });
    expect(map.apply_patch).toEqual({ capability: "filesystem.write", riskLevel: "medium" });
    expect(map.delete_file).toEqual({ capability: "filesystem.delete", riskLevel: "high" });
    expect(map.run_command).toEqual({ capability: "terminal.execute", riskLevel: "high" });
    expect(map.start_process).toEqual({ capability: "terminal.long_running", riskLevel: "critical" });
    expect(map.kill_process).toEqual({ capability: "applications.execute", riskLevel: "high" });
    expect(map.web_search).toEqual({ capability: "network.search", riskLevel: "medium" });
    expect(map.fetch_url).toEqual({ capability: "network.fetch", riskLevel: "medium" });
    expect(map.git_status).toEqual({ capability: "git.read", riskLevel: "low" });
    expect(map.git_diff).toEqual({ capability: "git.read", riskLevel: "low" });
    expect(map.git_commit).toEqual({ capability: "git.write", riskLevel: "high" });
    expect(map.git_push).toEqual({ capability: "git.write", riskLevel: "high" });
    expect(map.git_pull).toEqual({ capability: "git.write", riskLevel: "high" });
    expect(map.git_fetch).toEqual({ capability: "git.write", riskLevel: "high" });
    expect(map.load_skill).toEqual({ capability: "filesystem.read", riskLevel: "low" });
  });

  it("allows a skill-granted tool that would ask in read-only", async () => {
    const grants = new TaskGrantStore();
    const registry = new ToolRegistry();
    registry.register(fetch);
    applySkillToolGrants(
      parseSkill(`---
name: webby
allowedTools: [fetch_url]
---
Fetch docs.
`, "webby"),
      grants,
      registry,
    );
    const permissions = manager([fetch], { mode: "read-only", grants });
    expect(permissions.needsPrompt("fetch_url", { url: "https://docs.rs" })).toBe(false);
    expect(await permissions.authorize("fetch_url", { url: "https://docs.rs" })).toBe("allow");
  });

  it("runs the classifier on ask and fails closed to the human prompt", async () => {
    const asked: string[] = [];
    const classified: string[] = [];
    const permissions = manager([del], {
      classifier: async () => {
        throw new Error("gateway down");
      },
      onClassifier: (event) => classified.push(event.decision),
      prompter: {
        async prompt(request) {
          asked.push(request.tool);
          return "deny";
        },
      },
    });
    expect(await permissions.authorize("delete_file", { path: "src/a.ts" })).toBe("deny");
    expect(classified).toEqual(["ask_human"]);
    expect(asked).toEqual(["delete_file"]);
  });

  it("turns a classifier deny into a human prompt", async () => {
    const asked: string[] = [];
    const classified: string[] = [];
    const permissions = manager([del], {
      classifier: async () => ({ decision: "deny", reason: "nope" }),
      onClassifier: (event) => classified.push(event.decision),
      prompter: {
        async prompt(request) {
          asked.push(request.tool);
          return "allow-once";
        },
      },
    });
    expect(await permissions.authorize("delete_file", { path: "src/a.ts" })).toBe("allow");
    expect(classified).toEqual(["ask_human"]);
    expect(asked).toEqual(["delete_file"]);
  });

  it("skips the classifier in yolo mode", async () => {
    let called = 0;
    const permissions = manager([del], {
      yoloMode: true,
      classifier: async () => {
        called += 1;
        return { decision: "deny" };
      },
    });
    expect(await permissions.authorize("delete_file", { path: "src/a.ts" })).toBe("allow");
    expect(called).toBe(0);
  });
});

describe("idle tool context", () => {
  it("provides a project root for tests", () => {
    expect(idleToolContext().projectRoot).toBe("C:/Projects/TodoApp");
    expect(failResult("x", "y").success).toBe(false);
  });
});
