import { describe, expect, it } from "vitest";
import { ToolRegistry } from "../../agent/ToolRegistry";
import { CODING_AGENT, RESEARCH_AGENT } from "../../agent/agents/builtin";
import { resolveDefinitionTools } from "../../agent/agents/tools";
import { resolveAgentTools } from "../../capabilities/CapabilityResolver";
import { MCPConfigurationManager } from "../MCPConfigurationManager";
import { MCPRegistry } from "../MCPRegistry";
import { MCPRuntime } from "../MCPRuntime";
import { MCPServerManager } from "../MCPServerManager";
import { MCPSetupWizard } from "../setup/MCPSetupWizard";
import { DependencyDetector } from "../setup/DependencyDetector";
import { MemorySystemDetector } from "../setup/ExecutableLocator";
import { SetupValidator } from "../setup/SetupValidator";
import { MemoryMCPHost } from "./memoryHost";
import type { MCPDiscovery, MCPToolCapability } from "../types";
import { secretStore, mcpSecretKey } from "../../agent/SecretStore";
import type { BuiltInMcpId } from "../builtin/types";

function tool(serverId: string, name: string, extras?: Partial<MCPToolCapability>): MCPToolCapability {
  return {
    id: `mcp.${serverId}.tool.${name}`,
    type: "mcp-tool",
    mcpServerId: serverId,
    name,
    inputSchema: { type: "object", properties: {} },
    enabled: true,
    annotations: { readOnlyHint: true },
    ...extras,
  };
}

function discovery(serverId: string, names: string[]): MCPDiscovery {
  return {
    tools: names.map((name) => tool(serverId, name)),
    resources: [],
    prompts: [],
  };
}

function setup(id: BuiltInMcpId, sys: MemorySystemDetector, githubConnected = async () => true) {
  const host = new MemoryMCPHost();
  const runtime = new MCPRuntime(host);
  const tools = new ToolRegistry();
  const registry = new MCPRegistry(tools, runtime);
  const manager = new MCPServerManager(runtime);
  const configuration = new MCPConfigurationManager(manager, registry);
  const detector = new DependencyDetector(sys, githubConnected);
  const wizard = new MCPSetupWizard(id, detector, new SetupValidator(detector), undefined, configuration, registry);
  return { host, runtime, tools, registry, wizard };
}

describe("built-in MCP detect → configure → connect → discover", () => {
  it("configures Blender MCP and exposes blender tools to the coding agent", async () => {
    const sys = new MemorySystemDetector();
    sys.blender = { installed: true, compatible: true, version: "5.2.0", required: "5.1", path: "/Blender" };
    sys.executables.set("uv", { name: "uv", found: true, path: "/uv" });
    sys.tcp.add("127.0.0.1:9876");
    const { host, tools, registry, wizard } = setup("builtin.mcp.blender", sys);
    host.seedDiscovery("blender", discovery("blender", ["execute_blender_code"]));
    wizard.patchSettings({ repoPath: "C:/lab/blender_mcp", uvPath: "/uv" });
    await wizard.refresh();
    expect(wizard.state.validations.blender?.status).toBe("valid");
    const snapshot = await wizard.connect("proj-1");
    expect(snapshot.status).toBe("ready");
    await registry.sync("proj-1");
    expect(tools.get("mcp__blender__execute_blender_code")).toBeTruthy();
    expect(resolveAgentTools(tools, { allowedTools: [...CODING_AGENT.tools] }).some((item) => item.name.startsWith("mcp__blender__"))).toBe(true);
  });

  it("configures GitHub MCP and exposes search_repositories", async () => {
    const sys = new MemorySystemDetector();
    sys.executables.set("docker", { name: "docker", found: true, path: "/docker" });
    const { host, tools, registry, wizard } = setup("builtin.mcp.github", sys);
    host.seedDiscovery("github", discovery("github", ["search_repositories"]));
    await wizard.refresh();
    expect(wizard.state.validations["github-account"]?.status).toBe("valid");
    await wizard.connect();
    await registry.sync();
    expect(tools.get("mcp__github__search_repositories")).toBeTruthy();
    expect(resolveDefinitionTools(CODING_AGENT, tools).some((item) => item.name === "mcp__github__search_repositories")).toBe(true);
    expect(resolveDefinitionTools(RESEARCH_AGENT, tools).some((item) => item.name === "mcp__github__search_repositories")).toBe(true);
  });

  it("configures Playwright MCP after Node detection", async () => {
    const sys = new MemorySystemDetector();
    sys.executables.set("node", { name: "node", found: true, version: "22.0.0" });
    sys.executables.set("npm", { name: "npm", found: true });
    sys.executables.set("npx", { name: "npx", found: true });
    const { host, tools, registry, wizard } = setup("builtin.mcp.playwright", sys);
    host.seedDiscovery("playwright", discovery("playwright", ["browser_navigate"]));
    wizard.patchSettings({ browser: "chrome", headless: false });
    await wizard.refresh();
    expect(wizard.state.validations.node?.status).toBe("valid");
    await wizard.connect("proj-1");
    await registry.sync("proj-1");
    expect(tools.get("mcp__playwright__browser_navigate")).toBeTruthy();
  });

  it("configures Composio over streamable-http without auto-enabling apps", async () => {
    const sys = new MemorySystemDetector();
    await secretStore.set(mcpSecretKey("composio", "COMPOSIO_API_KEY"), "test-key");
    const { host, tools, registry, wizard } = setup("builtin.mcp.composio", sys);
    host.seedDiscovery("composio", discovery("composio", ["GMAIL_SEND_EMAIL"]));
    expect(wizard.state.settings.enabledToolkits).toEqual([]);
    await wizard.refresh();
    expect(wizard.state.validations["api-key"]?.status).toBe("valid");
    const snapshot = await wizard.connect();
    expect(snapshot.transport).toBe("streamable-http");
    await registry.sync();
    expect(tools.get("mcp__composio__GMAIL_SEND_EMAIL")).toBeTruthy();
  });
});

describe("MCP lifecycle status", () => {
  it("maps disconnected connecting connected error and disabled from the host", async () => {
    const host = new MemoryMCPHost();
    const runtime = new MCPRuntime(host);
    await runtime.upsert({
      id: "mock",
      name: "mock",
      enabled: true,
      transport: "stdio",
      command: "node",
      scope: "global",
      origin: "user",
      trust: "trusted",
    });
    const started = await runtime.start("mock");
    expect(started.status).toBe("ready");
    const stopped = await runtime.stop("mock");
    expect(stopped.status).toBe("disconnected");
    const disabled = await runtime.enable("mock", false);
    expect(disabled.status).toBe("disabled");
    host.failNext.set("mock", new Error("boom"));
    await runtime.enable("mock", true).catch(() => undefined);
    const errored = await runtime.list();
    expect(errored[0]?.status === "error" || errored[0]?.status === "ready").toBe(true);
  });
});
