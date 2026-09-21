import type { MCPHost } from "../MCPRuntime";
import type { MCPCallResult, MCPDiscovery, MCPHealthReport, MCPServerConfig, MCPServerSnapshot } from "../types";

function now() {
  return Date.now();
}

function snapshot(input: MCPServerConfig, extras?: Partial<MCPServerSnapshot>): MCPServerSnapshot {
  return {
    ...input,
    status: extras?.status ?? (input.enabled ? "ready" : "disabled"),
    lastConnectedAt: extras?.lastConnectedAt ?? now(),
    lastError: extras?.lastError ?? null,
    restartCount: extras?.restartCount ?? 0,
    toolCount: extras?.toolCount ?? 0,
    resourceCount: extras?.resourceCount ?? 0,
    promptCount: extras?.promptCount ?? 0,
    createdAt: extras?.createdAt ?? now(),
    updatedAt: extras?.updatedAt ?? now(),
  };
}

export class MemoryMCPHost implements MCPHost {
  servers = new Map<string, MCPServerSnapshot>();
  discoveries = new Map<string, MCPDiscovery>();
  calls: Array<{ id: string; tool: string; args: unknown }> = [];
  failNext = new Map<string, Error>();
  crashOnCall = new Set<string>();

  constructor(initial: MCPServerSnapshot[] = []) {
    for (const server of initial) this.servers.set(server.id, server);
  }

  seedDiscovery(id: string, discovery: MCPDiscovery) {
    this.discoveries.set(id, discovery);
    const server = this.servers.get(id);
    if (server) {
      this.servers.set(id, {
        ...server,
        toolCount: discovery.tools.length,
        resourceCount: discovery.resources.length,
        promptCount: discovery.prompts.length,
      });
    }
  }

  async list(projectId?: string | null) {
    return [...this.servers.values()].filter((server) => {
      if (server.scope === "global") return true;
      if (!projectId) return server.scope !== "project";
      return server.projectId === projectId;
    });
  }

  async upsert(input: MCPServerConfig) {
    const current = snapshot(input, this.servers.get(input.id));
    this.servers.set(input.id, current);
    return current;
  }

  async remove(id: string) {
    this.servers.delete(id);
    this.discoveries.delete(id);
  }

  async enable(id: string, enabled: boolean) {
    const server = this.require(id);
    const next = { ...server, enabled, status: enabled ? "ready" : "disabled" as const };
    this.servers.set(id, next);
    return next;
  }

  async start(id: string) {
    const server = this.require(id);
    if (this.failNext.has(id)) {
      const error = this.failNext.get(id)!;
      this.failNext.delete(id);
      const next = { ...server, status: "error" as const, lastError: error.message, restartCount: server.restartCount + 1 };
      this.servers.set(id, next);
      throw error;
    }
    const next = { ...server, enabled: true, status: "ready" as const, lastError: null };
    this.servers.set(id, next);
    return next;
  }

  async stop(id: string) {
    const server = this.require(id);
    const next = { ...server, status: "disconnected" as const };
    this.servers.set(id, next);
    return next;
  }

  async restart(id: string) {
    await this.stop(id);
    return this.start(id);
  }

  async callTool(id: string, tool: string, args: unknown): Promise<MCPCallResult> {
    this.calls.push({ id, tool, args });
    if (this.crashOnCall.has(id)) {
      const server = this.require(id);
      this.servers.set(id, { ...server, status: "error", lastError: "crashed" });
      return { success: false, error: { code: "mcp_connection", message: "MCP server crashed." }, durationMs: 4 };
    }
    if (tool === "echo") {
      return { success: true, data: { text: String((args as { text?: string }).text ?? "") }, durationMs: 1 };
    }
    if (tool === "add") {
      const input = args as { a?: number; b?: number };
      return { success: true, data: { sum: Number(input.a) + Number(input.b) }, durationMs: 1 };
    }
    if (tool === "search_issues") {
      return { success: true, data: [{ number: 18, title: "Add MCP health panel" }], durationMs: 2 };
    }
    return { success: true, data: args, durationMs: 1 };
  }

  async listTools(id: string) {
    return this.discoveries.get(id) ?? { tools: [], resources: [], prompts: [] };
  }

  async listResources(id: string) {
    return (await this.listTools(id) as MCPDiscovery).resources;
  }

  async listPrompts(id: string) {
    return (await this.listTools(id) as MCPDiscovery).prompts;
  }

  async readResource() {
    return { text: "Kursor mock project" };
  }

  async getPrompt() {
    return { messages: [] };
  }

  async health(id: string): Promise<MCPHealthReport> {
    const server = this.require(id);
    const ok = server.status === "ready";
    return {
      serverId: id,
      ok,
      checks: [{ id: "connection", label: "Connection established", status: ok ? "pass" : "fail" }],
    };
  }

  async bootstrap() {
    return this.list();
  }

  async switchProject(projectId?: string | null) {
    for (const server of this.servers.values()) {
      if (server.scope === "project" && server.projectId !== projectId) {
        this.servers.set(server.id, { ...server, status: "disconnected" });
      }
    }
    return this.list(projectId);
  }

  async cancel(id: string) {
    return this.stop(id);
  }

  async setToolEnabled(id: string, toolId: string, enabled: boolean) {
    const discovery = this.discoveries.get(id);
    if (!discovery) return;
    this.discoveries.set(id, {
      ...discovery,
      tools: discovery.tools.map((tool) => (
        tool.id === toolId || tool.name === toolId ? { ...tool, enabled } : tool
      )),
    });
  }

  private require(id: string) {
    const server = this.servers.get(id);
    if (!server) throw new Error(`Unknown MCP server '${id}'.`);
    return server;
  }
}

export function mockServer(id = "mock"): MCPServerSnapshot {
  return snapshot({
    id,
    name: id,
    displayName: id,
    enabled: true,
    transport: "stdio",
    command: "node",
    args: ["examples/mcp/mock-server.mjs"],
    scope: "global",
    origin: "user",
    trust: "untrusted",
  }, { status: "ready", toolCount: 3 });
}
