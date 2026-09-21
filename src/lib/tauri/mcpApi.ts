import { invokeCommand } from "./invoke";
import type {
  MCPCallResult,
  MCPDiscovery,
  MCPHealthReport,
  MCPServerConfig,
  MCPServerSnapshot,
} from "../mcp/types";

export interface McpUsagePayload {
  id: string;
  runId?: string | null;
  serverId: string;
  capabilityId?: string | null;
  toolName?: string | null;
  startedAt: number;
  finishedAt?: number | null;
  status: string;
  metadataJson?: string | null;
}

export const mcpApi = {
  list: (projectId?: string | null) =>
    invokeCommand<MCPServerSnapshot[]>("mcp_list", { projectId }, []),
  upsert: (input: MCPServerConfig) => invokeCommand<MCPServerSnapshot>("mcp_upsert", { input }),
  remove: (id: string) => invokeCommand<void>("mcp_remove", { id }),
  enable: (id: string, enabled: boolean) =>
    invokeCommand<MCPServerSnapshot>("mcp_enable", { id, enabled }),
  start: (id: string) => invokeCommand<MCPServerSnapshot>("mcp_start", { id }),
  stop: (id: string) => invokeCommand<MCPServerSnapshot>("mcp_stop", { id }),
  restart: (id: string) => invokeCommand<MCPServerSnapshot>("mcp_restart", { id }),
  callTool: (id: string, tool: string, arguments_: unknown, timeoutMs?: number) =>
    invokeCommand<MCPCallResult>("mcp_call_tool", {
      id,
      tool,
      arguments: arguments_ ?? {},
      timeoutMs,
    }),
  listTools: (id: string) => invokeCommand<MCPDiscovery>("mcp_list_tools", { id }),
  listResources: (id: string) => invokeCommand<unknown[]>("mcp_list_resources", { id }, []),
  listPrompts: (id: string) => invokeCommand<unknown[]>("mcp_list_prompts", { id }, []),
  readResource: (id: string, uri: string) => invokeCommand<unknown>("mcp_read_resource", { id, uri }),
  getPrompt: (id: string, name: string, arguments_?: unknown) =>
    invokeCommand<unknown>("mcp_get_prompt", { id, name, arguments: arguments_ }),
  health: (id: string) => invokeCommand<MCPHealthReport>("mcp_health", { id }),
  bootstrap: (projectId?: string | null) =>
    invokeCommand<MCPServerSnapshot[]>("mcp_bootstrap", { projectId }, []),
  switchProject: (projectId?: string | null, projectRoot?: string | null) =>
    invokeCommand<MCPServerSnapshot[]>("mcp_switch_project", { projectId, projectRoot }, []),
  recordUsage: (record: McpUsagePayload) =>
    invokeCommand<void>("mcp_record_usage", { record }),
  cancel: (id: string) => invokeCommand<MCPServerSnapshot>("mcp_cancel", { id }),
  setToolEnabled: (id: string, toolId: string, enabled: boolean) =>
    invokeCommand<void>("mcp_set_tool_enabled", { id, toolId, enabled }),
};
