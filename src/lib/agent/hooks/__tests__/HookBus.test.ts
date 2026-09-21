import { describe, expect, it } from "vitest";
import { allowAllGate } from "../../PermissionGate";
import { createManagerFromGate } from "../../PermissionManager";
import { ToolExecutor } from "../../ToolExecutor";
import { ToolRegistry, type AgentTool } from "../../ToolRegistry";
import { okResult } from "../../tools/result";
import { toolSchema } from "../../tools/schema";
import { HookBus } from "../HookBus";
import { parseHookYaml } from "../parseHook";

function createExecutor(hooks: HookBus, execute: AgentTool["execute"]) {
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

describe("HookBus", () => {
  it("denies read_file of .env from a declarative before_tool hook", async () => {
    const yaml = `name: block-env-read
event: before_tool
when: { tool: read_file, pathContains: ".env" }
action: deny
message: Reading .env is blocked by project hook.
`;
    const parsed = parseHookYaml(yaml, "block-env.yml");
    expect(parsed?.event).toBe("before_tool");
    const hooks = new HookBus();
    await hooks.loadProjectHooks({
      readFile: async () => yaml,
      listDirectory: async () => [{ name: "block-env.yml", path: ".kursor/hooks/block-env.yml", kind: "file" }],
    });
    const execute = async () => okResult({ content: "SECRET" });
    const executor = createExecutor(hooks, execute);
    const denied = await executor.run("read_file", { path: ".env" });
    expect(denied.success).toBe(false);
    expect(denied.error?.code).toBe("hook_denied");
    const allowed = await executor.run("read_file", { path: "src/app.ts" });
    expect(allowed.success).toBe(true);
  });
});
