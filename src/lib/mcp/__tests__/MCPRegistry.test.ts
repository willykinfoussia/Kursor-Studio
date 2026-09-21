import { describe, expect, it } from "vitest";
import { ToolRegistry } from "../../agent/ToolRegistry";
import { MCPRegistry } from "../MCPRegistry";
import { MCPRuntime } from "../MCPRuntime";
import { MCPServerManager } from "../MCPServerManager";
import type { MCPDiscovery } from "../types";
import { MemoryMCPHost, mockServer } from "./memoryHost";

const discovery: MCPDiscovery = {
  tools: [{
    id: "mcp.mock.tool.echo",
    type: "mcp-tool",
    mcpServerId: "mock",
    name: "echo",
    inputSchema: { type: "object", properties: { text: { type: "string" } } },
    enabled: true,
  }],
  resources: [{
    id: "mcp.mock.resource.mock%3A%2F%2Fproject-info",
    type: "mcp-resource",
    mcpServerId: "mock",
    uri: "mock://project-info",
    name: "Project info",
  }],
  prompts: [{
    id: "mcp.mock.prompt.test-prompt",
    type: "mcp-prompt",
    mcpServerId: "mock",
    name: "test-prompt",
  }],
};

describe("MCPRegistry and manager", () => {
  it("registers discovered tools and unregisters on disable", async () => {
    const host = new MemoryMCPHost([mockServer()]);
    host.seedDiscovery("mock", discovery);
    const runtime = new MCPRuntime(host);
    const tools = new ToolRegistry();
    const registry = new MCPRegistry(tools, runtime);
    const manager = new MCPServerManager(runtime);

    await registry.sync();
    expect(tools.get("mcp__mock__echo")).toBeTruthy();
    expect(registry.discoveryFor("mock")?.resources[0]?.uri).toBe("mock://project-info");
    expect(registry.discoveryFor("mock")?.prompts[0]?.name).toBe("test-prompt");

    await manager.disable("mock");
    await registry.sync();
    expect(tools.get("mcp__mock__echo")).toBeUndefined();

    await manager.enable("mock");
    await registry.sync();
    expect(tools.get("mcp__mock__echo")).toBeTruthy();

    await manager.stop("mock");
    await registry.sync();
    expect(tools.get("mcp__mock__echo")).toBeUndefined();

    await manager.start("mock");
    await registry.sync();
    expect(tools.get("mcp__mock__echo")).toBeTruthy();

    await manager.restart("mock");
    await registry.sync();
    expect(tools.get("mcp__mock__echo")).toBeTruthy();
  });
});
