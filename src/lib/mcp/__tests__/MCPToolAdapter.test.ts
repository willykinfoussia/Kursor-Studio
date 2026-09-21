import { describe, expect, it } from "vitest";
import { ToolRegistry } from "../../agent/ToolRegistry";
import { PermissionManager } from "../../agent/PermissionManager";
import { adaptMcpTool, mcpRiskFromAnnotations } from "../MCPToolAdapter";
import { MCPRuntime } from "../MCPRuntime";
import type { MCPToolCapability } from "../types";
import { MemoryMCPHost, mockServer } from "./memoryHost";

const echo: MCPToolCapability = {
  id: "mcp.mock.tool.echo",
  type: "mcp-tool",
  mcpServerId: "mock",
  name: "echo",
  description: "Echo",
  inputSchema: { type: "object", properties: { text: { type: "string" } }, required: ["text"] },
  enabled: true,
  annotations: { readOnlyHint: true },
};

describe("MCPToolAdapter", () => {
  it("maps read-only MCP tools to auto/low and executes through the runtime", async () => {
    const host = new MemoryMCPHost([mockServer()]);
    const runtime = new MCPRuntime(host);
    const tool = adaptMcpTool(mockServer(), echo, runtime);
    expect(tool.name).toBe("mcp__mock__echo");
    expect(mcpRiskFromAnnotations(echo)).toMatchObject({ approval: "auto", riskLevel: "low" });
    const result = await tool.execute({ text: "hi" }, { signal: new AbortController().signal, projectRoot: null });
    expect(result.success).toBe(true);
    expect(result.data).toEqual({ text: "hi" });
  });

  it("defaults third-party tools to high risk ask", () => {
    const risk = mcpRiskFromAnnotations({ ...echo, annotations: undefined });
    expect(risk.approval).toBe("ask");
    expect(risk.riskLevel).toBe("high");
  });

  it("forces Blender MCP tools to high risk even when annotated read-only", () => {
    const blender = mockServer("blender");
    blender.origin = "builtin";
    blender.metadata = { riskLevel: "high" };
    const risk = mcpRiskFromAnnotations(echo, blender);
    expect(risk.riskLevel).toBe("high");
    expect(risk.approval).toBe("ask");
  });
});

describe("MCP permissions", () => {
  it("hides disabled servers and asks before invoking third-party MCP tools", async () => {
    const host = new MemoryMCPHost([mockServer()]);
    const runtime = new MCPRuntime(host);
    const registry = new ToolRegistry();
    const mutating: MCPToolCapability = { ...echo, name: "write", annotations: { destructiveHint: true } };
    registry.register(adaptMcpTool(mockServer(), mutating, runtime));
    const asked: string[] = [];
    const permissions = new PermissionManager({
      mode: "workspace-write",
      confirmDestructive: true,
      registry,
      getProjectRoot: () => "C:/GitHub/Kursor",
      prompter: {
        async prompt(request) {
          asked.push(request.tool);
          return "deny";
        },
      },
    });
    expect(await permissions.authorize("mcp__mock__write", { text: "x" })).toBe("deny");
    expect(asked).toEqual(["mcp__mock__write"]);
  });
});
