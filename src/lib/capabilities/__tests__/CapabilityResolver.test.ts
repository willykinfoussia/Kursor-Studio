import { describe, expect, it } from "vitest";
import { ToolRegistry, type AgentTool } from "../../agent/ToolRegistry";
import { resolveAgentTools, toolNameMatches } from "../../capabilities/CapabilityResolver";
import { okResult } from "../../agent/tools/result";
import { toolSchema } from "../../agent/tools/schema";
import { toolPermission } from "../../agent/permissions/meta";

function tool(name: string): AgentTool {
  return {
    name,
    description: name,
    ...toolPermission(name.startsWith("mcp__") ? "mcp.invoke" : "filesystem.read", "low"),
    parameters: toolSchema({}),
    timeoutMs: 1000,
    mutate: false,
    execute: async () => okResult({}),
  };
}

describe("CapabilityResolver", () => {
  it("keeps connected MCP tools that match allowed wildcards", () => {
    const registry = new ToolRegistry();
    registry.register(tool("read_file"));
    registry.register(tool("mcp__github__search_issues"));
    registry.register(tool("mcp__mock__echo"));
    const tools = resolveAgentTools(registry, {
      allowedTools: ["read_file", "mcp__github__*"],
      deniedTools: ["mcp__mock__*"],
      disabledCapabilityIds: [],
    });
    expect(tools.map((item) => item.name)).toEqual(["read_file", "mcp__github__search_issues"]);
    expect(toolNameMatches("mcp__github__search_issues", "mcp__github__*")).toBe(true);
  });

  it("drops disabled native and MCP tools", () => {
    const registry = new ToolRegistry();
    registry.register(tool("read_file"));
    registry.register(tool("write_file"));
    registry.register(tool("mcp__github__search_issues"));
    const tools = resolveAgentTools(registry, {
      disabledCapabilityIds: ["builtin.tool.write_file", "mcp.github.tool.search_issues"],
    });
    expect(tools.map((item) => item.name)).toEqual(["read_file"]);
  });
});
