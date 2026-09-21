import type { RiskLevel } from "../agent/permissions/types";
import type { MCPScope, MCPTransport } from "../mcp/types";

export type CapabilityType = "skill" | "tool" | "mcp";
export type CapabilityDetailKind = CapabilityType | "mcp-tool" | "mcp-resource" | "mcp-prompt";
export type CapabilityStatus = "enabled" | "disabled" | "error" | "unavailable";
export type CapabilityConnectionStatus = "connected" | "disconnected" | "error" | "disabled";
export type SkillScope = "global" | "project" | "agent";
export type ToolCapabilityCategory =
  | "filesystem"
  | "terminal"
  | "web"
  | "git"
  | "browser"
  | "application"
  | "system"
  | "agent";

export type CapabilitySource =
  | { type: "builtin"; name: string }
  | { type: "project"; path: string }
  | { type: "user"; path: string }
  | { type: "mcp"; serverId: string }
  | { type: "external"; url?: string };

export interface CapabilityPermission {
  id: string;
  group: string;
  action: string;
  allowed: boolean;
  scopeLabel: string;
  explanation: string;
}

export interface CapabilityDependency {
  capabilityId: string;
  type: CapabilityType;
  name: string;
}

export interface Capability {
  id: string;
  type: CapabilityType;
  name: string;
  displayName: string;
  description?: string;
  version?: string;
  author?: string;
  source: CapabilitySource;
  enabled: boolean;
  status: CapabilityStatus;
  tags?: string[];
  permissions?: CapabilityPermission[];
  dependencies?: CapabilityDependency[];
  documentationUrl?: string;
  metadata?: Record<string, unknown>;
}

export interface SkillCapability extends Capability {
  type: "skill";
  instructions: string;
  triggers?: string[];
  allowedTools?: string[];
  modelPreference?: string;
  priority?: number;
  scope: SkillScope;
  sourcePath?: string;
  supportingFiles?: string[];
}

export interface ToolCapability extends Capability {
  type: "tool";
  category: ToolCapabilityCategory;
  inputSchema?: unknown;
  outputSchema?: unknown;
  requiresApproval: boolean;
  riskLevel: RiskLevel;
  runtimeName: string;
  approval: "auto" | "ask" | "confirm-destructive";
}

export interface McpNestedTool {
  id: string;
  name: string;
  description?: string;
  inputSchema?: unknown;
  outputSchema?: unknown;
  enabled: boolean;
}

export interface McpNestedResource {
  id: string;
  name: string;
  uri: string;
  description?: string;
}

export interface McpNestedPrompt {
  id: string;
  name: string;
  description?: string;
}

export interface MCPServerCapability extends Capability {
  type: "mcp";
  serverName: string;
  transport: MCPTransport;
  endpoint?: string;
  tools: McpNestedTool[];
  resources?: McpNestedResource[];
  prompts?: McpNestedPrompt[];
  connectionStatus: CapabilityConnectionStatus;
  scope: MCPScope;
  lastError?: string;
}

export interface McpChildCapability extends Capability {
  type: "mcp";
  kind: "mcp-tool" | "mcp-resource" | "mcp-prompt";
  parentId: string;
  parentName: string;
  inputSchema?: unknown;
  outputSchema?: unknown;
  uri?: string;
  runtimeName?: string;
}

export type CapabilityDetail = SkillCapability | ToolCapability | MCPServerCapability | McpChildCapability;

export interface CapabilitySummary {
  id: string;
  type: CapabilityType;
  kind: CapabilityDetailKind;
  parentId?: string;
  name: string;
  displayName: string;
  description?: string;
  version?: string;
  source: CapabilitySource;
  enabled: boolean;
  status: CapabilityStatus;
  connectionStatus?: CapabilityConnectionStatus;
  tags: string[];
  category?: ToolCapabilityCategory;
  riskLevel?: RiskLevel;
  scope?: SkillScope | MCPScope;
  agentIds: string[];
  projectId?: string | null;
  sourcePath?: string;
  toolCount?: number;
  resourceCount?: number;
  promptCount?: number;
  lastError?: string;
  searchText: string;
}

export interface CapabilityReference {
  capabilityId: string;
  type: CapabilityType;
  runId?: string;
  agentId?: string;
  stepId?: string;
  usageCount?: number;
}

export interface CapabilityUsage {
  id: string;
  capabilityId: string;
  runId: string;
  agentId?: string;
  stepId?: string;
  startedAt: number;
  finishedAt?: number;
  status: "started" | "completed" | "failed";
  inputRef?: string;
  outputRef?: string;
}

export interface CapabilityRecentRun {
  runId: string;
  title: string;
  usageInstanceId?: string;
  startedAt?: number;
}

export interface CapabilityStats {
  totalUses: number;
  lastUsedAt: number | null;
  successRate: number | null;
  avgDurationMs: number | null;
  agentIds: string[];
  projectIds: string[];
  recentRuns: CapabilityRecentRun[];
}

export interface CapabilityFilters {
  type?: "all" | CapabilityType;
  sources?: Array<CapabilitySource["type"]>;
  statuses?: CapabilityStatus[];
  risk?: RiskLevel[];
  scope?: Array<SkillScope | MCPScope | "all">;
  agentId?: string | "all";
  project?: "current" | "all" | "global";
  currentProjectId?: string | null;
}

export interface CapabilityResolveOptions {
  allowedTools?: string[];
  deniedTools?: string[];
  disabledCapabilityIds?: string[];
  projectId?: string | null;
  agentId?: string | null;
}

export interface CapabilityFile {
  path: string;
  content?: string;
}

export interface CapabilityManifest {
  type: CapabilityType;
  id: string;
  version: string;
  name: string;
  description?: string;
  permissions?: string[];
  dependencies?: string[];
  compatibility?: string;
  entrypoint?: string;
}

export interface CapabilityPackage {
  manifest: CapabilityManifest;
  files: CapabilityFile[];
}

export interface CapabilityValidationResult {
  ok: boolean;
  errors: string[];
}

export interface CapabilityInstaller {
  validatePackage(): Promise<CapabilityValidationResult>;
  install(): Promise<Capability>;
  update(): Promise<Capability>;
  uninstall(): Promise<void>;
}

/** @deprecated Use CapabilitySummary. Kept for the previous unused façade. */
export type CapabilityKind = CapabilityDetailKind;
/** @deprecated Use CapabilitySource["type"]. */
export type CapabilityOrigin = CapabilitySource["type"] | "imported" | "global";
/** @deprecated Use CapabilitySummary. */
export type CapabilityRecord = CapabilitySummary;
