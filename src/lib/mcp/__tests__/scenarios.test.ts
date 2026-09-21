import { describe, expect, it } from "vitest";
import { ToolRegistry } from "../../agent/ToolRegistry";
import { PermissionManager } from "../../agent/PermissionManager";
import { RunGraphProjector } from "../../workflow/RunGraphProjector";
import { adaptMcpTool } from "../MCPToolAdapter";
import { MCPRegistry } from "../MCPRegistry";
import { MCPRuntime } from "../MCPRuntime";
import type { MCPDiscovery, MCPToolCapability } from "../types";
import { MemoryMCPHost, mockServer } from "./memoryHost";
import type { AgentEvent } from "../../agent/types";
import type { AgentRunEvent } from "../../workflow/events";

const echo: MCPToolCapability = {
  id: "mcp.mock.tool.echo",
  type: "mcp-tool",
  mcpServerId: "mock",
  name: "echo",
  inputSchema: { type: "object", properties: { text: { type: "string" } } },
  enabled: true,
  annotations: { readOnlyHint: true },
};

const github: MCPToolCapability = {
  id: "mcp.github-mock.tool.search_issues",
  type: "mcp-tool",
  mcpServerId: "github-mock",
  name: "search_issues",
  inputSchema: { type: "object", properties: { query: { type: "string" } } },
  enabled: true,
  annotations: { readOnlyHint: true, openWorldHint: true },
};

const discovery: MCPDiscovery = {
  tools: [echo],
  resources: [{ id: "r", type: "mcp-resource", mcpServerId: "mock", uri: "mock://project-info" }],
  prompts: [{ id: "p", type: "mcp-prompt", mcpServerId: "mock", name: "test-prompt" }],
};

function runEvent(sequence: number, payload: AgentEvent): AgentRunEvent {
  return {
    id: `e${sequence}`,
    runId: "run-mcp",
    timestamp: sequence * 1000,
    sequence,
    type: payload.type,
    payload,
  };
}

describe("MCP integration scenarios", () => {
  it("discovers and calls the mock echo tool", async () => {
    const host = new MemoryMCPHost([mockServer()]);
    host.seedDiscovery("mock", discovery);
    const runtime = new MCPRuntime(host);
    const tools = new ToolRegistry();
    await new MCPRegistry(tools, runtime).sync();
    const result = await tools.get("mcp__mock__echo")!.execute({ text: "ping" }, {
      signal: new AbortController().signal,
      projectRoot: null,
    });
    expect(result.success).toBe(true);
    expect(host.calls[0]).toMatchObject({ tool: "echo" });
  });

  it("calls the GitHub mock search_issues tool", async () => {
    const server = mockServer("github-mock");
    const host = new MemoryMCPHost([server]);
    host.seedDiscovery("github-mock", { tools: [github], resources: [], prompts: [] });
    const runtime = new MCPRuntime(host);
    const tool = adaptMcpTool(server, github, runtime);
    const result = await tool.execute({ query: "MCP" }, { signal: new AbortController().signal, projectRoot: null });
    expect(result.success).toBe(true);
    expect(JSON.stringify(result.data)).toContain("health");
  });

  it("maps a crashed server to a connection error", async () => {
    const host = new MemoryMCPHost([mockServer()]);
    host.crashOnCall.add("mock");
    const runtime = new MCPRuntime(host);
    const result = await adaptMcpTool(mockServer(), echo, runtime).execute({ text: "x" }, {
      signal: new AbortController().signal,
      projectRoot: null,
    });
    expect(result.success).toBe(false);
    expect(result.error?.code).toBe("mcp_connection");
  });

  it("asks for approval on destructive MCP tools", async () => {
    const runtime = new MCPRuntime(new MemoryMCPHost([mockServer()]));
    const registry = new ToolRegistry();
    registry.register(adaptMcpTool(mockServer(), { ...echo, annotations: { destructiveHint: true } }, runtime));
    const permissions = new PermissionManager({
      mode: "full-access",
      confirmDestructive: true,
      registry,
      getProjectRoot: () => "C:/GitHub/Kursor",
      prompter: { async prompt() { return "deny"; } },
    });
    expect(await permissions.authorize("mcp__mock__echo", { text: "x" })).toBe("deny");
  });

  it("projects mcp_server parent nodes above mcp_tool children", () => {
    const projector = new RunGraphProjector();
    projector.ingest(runEvent(1, {
      type: "started",
      requestId: "run-mcp",
      messageId: "m1",
      model: "laguna",
      userMessage: { id: "u1", role: "user", content: "search", timestamp: 1 },
    }));
    projector.ingest(runEvent(2, { type: "tool-started", id: "t1", tool: "mcp__github-mock__search_issues", input: { query: "MCP" } }));
    projector.ingest(runEvent(3, { type: "tool-completed", id: "t1", tool: "mcp__github-mock__search_issues", output: { success: true } }));
    const graph = projector.snapshot();
    expect(graph.nodes.some((node) => node.type === "mcp_server" && node.id === "mcp-server:github-mock")).toBe(true);
    const tool = graph.nodes.find((node) => node.type === "mcp_tool");
    expect(tool?.parentId).toBe("mcp-server:github-mock");
    expect(graph.edges.some((edge) => edge.source === "mcp-server:github-mock" && edge.target === "tool:t1")).toBe(true);
  });
});
