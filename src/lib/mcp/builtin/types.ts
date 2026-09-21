import type { RiskLevel } from "../../agent/permissions/types";
import type { MCPScope, MCPServerConfig, MCPServerSnapshot, MCPServerStatus, MCPTransport } from "../types";

export type BuiltInMcpId =
  | "builtin.mcp.blender"
  | "builtin.mcp.github"
  | "builtin.mcp.composio"
  | "builtin.mcp.playwright";

export type BuiltInMcpServerId = "blender" | "github" | "composio" | "playwright";

export type BuiltInMcpCategory = "3d" | "automation" | "developer" | "browser" | "productivity";

export type MCPRequirementType =
  | "executable"
  | "application"
  | "directory"
  | "environment"
  | "credential"
  | "version";

export interface MCPRequirement {
  type: MCPRequirementType;
  name: string;
  required: boolean;
  minVersion?: string;
}

export interface MCPPermissionHint {
  id: string;
  group: string;
  action: string;
  risk: RiskLevel;
  explanation: string;
}

export interface BuiltInMCPDefinition {
  id: BuiltInMcpId;
  serverId: BuiltInMcpServerId;
  name: string;
  displayName: string;
  description: string;
  vendor?: string;
  category: BuiltInMcpCategory;
  transports: MCPTransport[];
  defaultScope: MCPScope;
  riskLevel: RiskLevel;
  docsUrl: string;
  websiteUrl?: string;
  requirements: MCPRequirement[];
  permissions: MCPPermissionHint[];
  setupSteps: string[];
  defaultSettings: Record<string, unknown>;
  buildConfig: (settings: Record<string, unknown>, extras?: BuiltInConfigContext) => MCPServerConfig;
}

export interface BuiltInConfigContext {
  projectId?: string | null;
  trusted?: boolean;
  enabled?: boolean;
}

export type BuiltInLifecycleStatus =
  | "known"
  | "setup-incomplete"
  | "configured"
  | "disabled"
  | "disconnected"
  | "connecting"
  | "connected"
  | "ready"
  | "error";

export interface BuiltInMCPInstance {
  definition: BuiltInMCPDefinition;
  snapshot: MCPServerSnapshot | null;
  settings: Record<string, unknown>;
  status: BuiltInLifecycleStatus;
  setupStep?: string;
}

export function readyStatuses(): MCPServerStatus[] {
  return ["ready", "connected"];
}

export function lifecycleFromSnapshot(snapshot: MCPServerSnapshot | null, setupIncomplete: boolean): BuiltInLifecycleStatus {
  if (!snapshot) return "known";
  if (setupIncomplete) return "setup-incomplete";
  if (!snapshot.enabled || snapshot.status === "disabled") return "disabled";
  if (snapshot.status === "ready") return "ready";
  if (snapshot.status === "connected") return "connected";
  if (snapshot.status === "connecting" || snapshot.status === "starting" || snapshot.status === "initializing" || snapshot.status === "discovering") {
    return "connecting";
  }
  if (snapshot.status === "error") return "error";
  return "disconnected";
}

export function readSettings(snapshot: MCPServerSnapshot | null): Record<string, unknown> {
  const metadata = snapshot?.metadata;
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return {};
  const settings = (metadata as { settings?: unknown }).settings;
  if (!settings || typeof settings !== "object" || Array.isArray(settings)) return {};
  return { ...settings as Record<string, unknown> };
}

export function readSetupStep(snapshot: MCPServerSnapshot | null) {
  const metadata = snapshot?.metadata;
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return undefined;
  const step = (metadata as { setupStep?: unknown }).setupStep;
  return typeof step === "string" && step ? step : undefined;
}

export function isSetupIncomplete(snapshot: MCPServerSnapshot | null) {
  return Boolean(readSetupStep(snapshot));
}

export function lifecycleLabel(status: BuiltInLifecycleStatus) {
  if (status === "known") return "Setup required";
  if (status === "setup-incomplete") return "Incomplete";
  if (status === "ready" || status === "connected") return "Connected";
  if (status === "configured" || status === "disconnected") return "Configured";
  if (status === "connecting") return "Connecting";
  if (status === "disabled") return "Disabled";
  if (status === "error") return "Error";
  return status;
}
