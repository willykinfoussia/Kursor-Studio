import { isMcpRuntimeName } from "./types";
import { adaptMcpTool } from "./MCPToolAdapter";
import type { MCPRuntime } from "./MCPRuntime";
import { mcpRuntime } from "./MCPRuntime";
import type { MCPDiscovery, MCPServerSnapshot } from "./types";
import { toolRegistry, type ToolRegistry } from "../agent/ToolRegistry";

const READY = new Set(["ready", "connected"]);

export class MCPRegistry {
  private servers: MCPServerSnapshot[] = [];
  private discoveries = new Map<string, MCPDiscovery>();
  private projectId: string | null | undefined;
  private listening = false;

  constructor(
    private readonly tools: ToolRegistry = toolRegistry,
    private readonly runtime: MCPRuntime = mcpRuntime,
  ) {}

  listServers() {
    return this.servers;
  }

  discoveryFor(serverId: string) {
    return this.discoveries.get(serverId);
  }

  bindEvents() {
    if (this.listening) return;
    this.listening = true;
    this.runtime.on((event) => {
      if (event.type.startsWith("mcp-tool-") && !event.type.includes("discovered")) return;
      void this.sync(this.projectId);
    });
  }

  async sync(projectId: string | null | undefined = this.projectId) {
    this.projectId = projectId;
    this.servers = await this.runtime.list(projectId);
    this.discoveries.clear();
    this.tools.unregisterWhere((tool) => isMcpRuntimeName(tool.name));
    for (const server of this.servers) {
      if (!server.enabled || !READY.has(server.status)) continue;
      if (server.scope === "agent") continue;
      try {
        const discovery = await this.runtime.listTools(server.id);
        this.discoveries.set(server.id, discovery);
        for (const tool of discovery.tools) {
          if (!tool.enabled) continue;
          this.tools.register(adaptMcpTool(server, tool, this.runtime));
        }
      } catch {
        this.discoveries.delete(server.id);
      }
    }
    return this.servers;
  }
}

export const mcpRegistry = new MCPRegistry();
