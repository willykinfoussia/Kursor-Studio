import { listenEvent, TAURI_EVENTS } from "../tauri/events";
import { mcpApi } from "../tauri/mcpApi";
import { parseMcpDiscovery } from "./discovery";
import type {
  MCPCallResult,
  MCPDiscovery,
  MCPHealthReport,
  MCPServerConfig,
  MCPServerSnapshot,
} from "./types";

export interface MCPRuntimeEvent {
  type: string;
  serverId: string;
  toolName?: string;
  message?: string;
  count?: number;
}

export type MCPRuntimeListener = (event: MCPRuntimeEvent) => void;

export interface MCPHost {
  list(projectId?: string | null): Promise<MCPServerSnapshot[]>;
  upsert(input: MCPServerConfig): Promise<MCPServerSnapshot>;
  remove(id: string): Promise<void>;
  enable(id: string, enabled: boolean): Promise<MCPServerSnapshot>;
  start(id: string): Promise<MCPServerSnapshot>;
  stop(id: string): Promise<MCPServerSnapshot>;
  restart(id: string): Promise<MCPServerSnapshot>;
  callTool(id: string, tool: string, args: unknown, timeoutMs?: number): Promise<MCPCallResult>;
  listTools(id: string): Promise<unknown>;
  listResources(id: string): Promise<unknown[]>;
  listPrompts(id: string): Promise<unknown[]>;
  readResource(id: string, uri: string): Promise<unknown>;
  getPrompt(id: string, name: string, args?: unknown): Promise<unknown>;
  health(id: string): Promise<MCPHealthReport>;
  bootstrap(projectId?: string | null): Promise<MCPServerSnapshot[]>;
  switchProject(projectId?: string | null, projectRoot?: string | null): Promise<MCPServerSnapshot[]>;
  cancel(id: string): Promise<MCPServerSnapshot>;
  setToolEnabled(id: string, toolId: string, enabled: boolean): Promise<void>;
}

const tauriHost: MCPHost = {
  list: (projectId) => mcpApi.list(projectId),
  upsert: (input) => mcpApi.upsert(input),
  remove: (id) => mcpApi.remove(id),
  enable: (id, enabled) => mcpApi.enable(id, enabled),
  start: (id) => mcpApi.start(id),
  stop: (id) => mcpApi.stop(id),
  restart: (id) => mcpApi.restart(id),
  callTool: (id, tool, args, timeoutMs) => mcpApi.callTool(id, tool, args, timeoutMs),
  listTools: (id) => mcpApi.listTools(id),
  listResources: (id) => mcpApi.listResources(id),
  listPrompts: (id) => mcpApi.listPrompts(id),
  readResource: (id, uri) => mcpApi.readResource(id, uri),
  getPrompt: (id, name, args) => mcpApi.getPrompt(id, name, args),
  health: (id) => mcpApi.health(id),
  bootstrap: (projectId) => mcpApi.bootstrap(projectId),
  switchProject: (projectId, projectRoot) => mcpApi.switchProject(projectId, projectRoot),
  cancel: (id) => mcpApi.cancel(id),
  setToolEnabled: (id, toolId, enabled) => mcpApi.setToolEnabled(id, toolId, enabled),
};

export class MCPRuntime {
  private readonly listeners = new Set<MCPRuntimeListener>();
  private unlisten: (() => void) | undefined;
  private listening = false;

  constructor(private readonly host: MCPHost = tauriHost) {}

  async ensureListening() {
    if (this.listening) return;
    this.listening = true;
    this.unlisten = await listenEvent<Record<string, unknown>>(TAURI_EVENTS.mcpEvent, (payload) => {
      this.emit({
        type: String(payload.type ?? payload.kind ?? ""),
        serverId: String(payload.serverId ?? payload.server_id ?? ""),
        toolName: optionalString(payload.toolName ?? payload.tool_name),
        message: optionalString(payload.message),
        count: typeof payload.count === "number" ? payload.count : undefined,
      });
    });
  }

  on(listener: MCPRuntimeListener) {
    this.listeners.add(listener);
    void this.ensureListening();
    return () => this.listeners.delete(listener);
  }

  private emit(event: MCPRuntimeEvent) {
    for (const listener of this.listeners) listener(event);
  }

  list(projectId?: string | null) {
    return this.host.list(projectId);
  }

  upsert(input: MCPServerConfig) {
    return this.host.upsert(input);
  }

  remove(id: string) {
    return this.host.remove(id);
  }

  enable(id: string, enabled: boolean) {
    return this.host.enable(id, enabled);
  }

  start(id: string) {
    return this.host.start(id);
  }

  stop(id: string) {
    return this.host.stop(id);
  }

  restart(id: string) {
    return this.host.restart(id);
  }

  callTool(id: string, tool: string, args: unknown, timeoutMs?: number) {
    return this.host.callTool(id, tool, args, timeoutMs);
  }

  async listTools(id: string): Promise<MCPDiscovery> {
    return parseMcpDiscovery(id, await this.host.listTools(id));
  }

  listResources(id: string) {
    return this.host.listResources(id);
  }

  listPrompts(id: string) {
    return this.host.listPrompts(id);
  }

  readResource(id: string, uri: string) {
    return this.host.readResource(id, uri);
  }

  getPrompt(id: string, name: string, args?: unknown) {
    return this.host.getPrompt(id, name, args);
  }

  health(id: string) {
    return this.host.health(id);
  }

  bootstrap(projectId?: string | null) {
    return this.host.bootstrap(projectId);
  }

  switchProject(projectId?: string | null, projectRoot?: string | null) {
    return this.host.switchProject(projectId, projectRoot);
  }

  cancel(id: string) {
    return this.host.cancel(id);
  }

  setToolEnabled(id: string, toolId: string, enabled: boolean) {
    return this.host.setToolEnabled(id, toolId, enabled);
  }

  dispose() {
    this.unlisten?.();
    this.unlisten = undefined;
    this.listening = false;
    this.listeners.clear();
  }
}

export const mcpRuntime = new MCPRuntime();

function optionalString(value: unknown) {
  return typeof value === "string" && value ? value : undefined;
}
