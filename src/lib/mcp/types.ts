export const MCP_TIMEOUT_MS = 30_000;
export const MAX_MCP_TOOL_OUTPUT_CHARS = 20_000;
export const MCP_MAX_RETRIES = 3;

export type MCPTransport = "stdio" | "sse" | "streamable-http";
export type MCPServerStatus =
  | "disconnected"
  | "connecting"
  | "connected"
  | "error"
  | "disabled"
  | "starting"
  | "initializing"
  | "discovering"
  | "ready";
export type MCPScope = "global" | "project" | "agent";
export type MCPOrigin = "builtin" | "user" | "project" | "imported";
export type MCPTrust = "trusted" | "untrusted" | "blocked";
export type MCPCapabilityType = "mcp-tool" | "mcp-resource" | "mcp-prompt";
export type MCPUsageStatus = "started" | "completed" | "failed";
export type MCPHealthCheckStatus = "pass" | "fail" | "skip";

export interface MCPEnvironmentVariable {
  name: string;
  value?: string;
  secretRef?: string;
  required: boolean;
}

export interface MCPReconnectPolicy {
  enabled: boolean;
  maxRetries: number;
  backoffMs: number;
}

export interface MCPServerConfig {
  id: string;
  name: string;
  displayName?: string;
  enabled: boolean;
  transport: MCPTransport;
  command?: string;
  args?: string[];
  url?: string;
  env?: MCPEnvironmentVariable[];
  scope: MCPScope;
  origin: MCPOrigin;
  trust: MCPTrust;
  version?: string;
  timeoutMs?: number;
  projectId?: string | null;
  metadata?: Record<string, unknown>;
}

export interface MCPServerSnapshot extends MCPServerConfig {
  status: MCPServerStatus;
  lastConnectedAt?: number | null;
  lastError?: string | null;
  restartCount: number;
  toolCount: number;
  resourceCount: number;
  promptCount: number;
  createdAt: number;
  updatedAt: number;
}

export interface MCPToolAnnotations {
  readOnlyHint?: boolean;
  destructiveHint?: boolean;
  idempotentHint?: boolean;
  openWorldHint?: boolean;
}

export interface MCPToolCapability {
  id: string;
  type: "mcp-tool";
  mcpServerId: string;
  name: string;
  description?: string;
  inputSchema: unknown;
  outputSchema?: unknown;
  enabled: boolean;
  annotations?: MCPToolAnnotations;
}

export interface MCPResourceCapability {
  id: string;
  type: "mcp-resource";
  mcpServerId: string;
  uri: string;
  name?: string;
  description?: string;
  mimeType?: string;
}

export interface MCPPromptArgument {
  name: string;
  description?: string;
  required?: boolean;
}

export interface MCPPromptCapability {
  id: string;
  type: "mcp-prompt";
  mcpServerId: string;
  name: string;
  description?: string;
  arguments?: MCPPromptArgument[];
}

export type MCPCapability = MCPToolCapability | MCPResourceCapability | MCPPromptCapability;

export interface MCPCapabilityUsage {
  id: string;
  capabilityId: string;
  serverId: string;
  toolName?: string;
  resourceUri?: string;
  promptName?: string;
  runId: string;
  agentId?: string;
  stepId?: string;
  startedAt: number;
  finishedAt?: number;
  status: MCPUsageStatus;
  metadata?: Record<string, unknown>;
}

export interface MCPPackage {
  id: string;
  name: string;
  version: string;
  description: string;
  publisher?: string;
  manifest: unknown;
  permissions: string[];
}

export interface MCPHealthCheck {
  id: string;
  label: string;
  status: MCPHealthCheckStatus;
  detail?: string;
}

export interface MCPHealthReport {
  serverId: string;
  ok: boolean;
  checks: MCPHealthCheck[];
}

export interface MCPCallResult {
  success: boolean;
  data?: unknown;
  error?: { code: string; message: string };
  truncated?: boolean;
  durationMs: number;
}

export interface MCPDiscovery {
  tools: MCPToolCapability[];
  resources: MCPResourceCapability[];
  prompts: MCPPromptCapability[];
}

export const DEFAULT_MCP_RECONNECT_POLICY: MCPReconnectPolicy = {
  enabled: true,
  maxRetries: MCP_MAX_RETRIES,
  backoffMs: 500,
};

export function isMcpRuntimeName(name: string) {
  return name.startsWith("mcp__");
}
