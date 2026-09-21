export type Capability =
  | "filesystem.read"
  | "filesystem.write"
  | "filesystem.delete"
  | "terminal.execute"
  | "terminal.long_running"
  | "network.search"
  | "network.fetch"
  | "git.read"
  | "git.write"
  | "applications.execute"
  | "mcp.invoke";

export type RiskLevel = "low" | "medium" | "high" | "critical";

export type PermissionMode = "read-only" | "workspace-write" | "full-access";

export const PERMISSION_MODES: readonly PermissionMode[] = [
  "read-only",
  "workspace-write",
  "full-access",
];

export type ApprovalDecision = "allow-once" | "allow-task" | "allow-permanent" | "deny";

export type PermissionScope =
  | { kind: "project" }
  | { kind: "paths"; prefixes: string[] }
  | { kind: "commands"; families: string[] }
  | { kind: "domains"; hosts: string[] }
  | { kind: "tools"; names: string[] };

export interface PermissionRule {
  action: "allow" | "ask" | "deny";
  tool?: string;
  capability?: Capability;
  scope?: PermissionScope;
}

export interface PermissionGrant {
  id: string;
  capability: Capability;
  scope: PermissionScope;
  duration: "task" | "permanent";
  tool?: string;
}

export interface ApprovalRequest {
  id: string;
  tool: string;
  input: unknown;
  reason: string;
  riskLevel: RiskLevel;
  capability: Capability;
  scope: PermissionScope;
  mode: PermissionMode;
}

export const CAPABILITIES: readonly Capability[] = [
  "filesystem.read",
  "filesystem.write",
  "filesystem.delete",
  "terminal.execute",
  "terminal.long_running",
  "network.search",
  "network.fetch",
  "git.read",
  "git.write",
  "applications.execute",
  "mcp.invoke",
];

export function isPermissionMode(value: unknown): value is PermissionMode {
  return value === "read-only" || value === "workspace-write" || value === "full-access";
}

export function isCapability(value: unknown): value is Capability {
  return typeof value === "string" && (CAPABILITIES as readonly string[]).includes(value);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

export function isPermissionScope(value: unknown): value is PermissionScope {
  if (!value || typeof value !== "object") return false;
  const scope = value as PermissionScope;
  if (scope.kind === "project") return true;
  if (scope.kind === "paths") return isStringArray(scope.prefixes);
  if (scope.kind === "commands") return isStringArray(scope.families);
  if (scope.kind === "domains") return isStringArray(scope.hosts);
  if (scope.kind === "tools") return isStringArray(scope.names);
  return false;
}

export function sanitizePermissionWhitelist(value: unknown): PermissionRule[] {
  if (!Array.isArray(value)) return [];
  const rules: PermissionRule[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const raw = item as PermissionRule;
    if (raw.action !== "allow") continue;
    const rule: PermissionRule = { action: "allow" };
    if (typeof raw.tool === "string" && raw.tool.trim()) rule.tool = raw.tool.trim();
    if (isCapability(raw.capability)) rule.capability = raw.capability;
    if (isPermissionScope(raw.scope)) rule.scope = raw.scope;
    if (!rule.tool && !rule.capability && !rule.scope) continue;
    rules.push(rule);
  }
  return rules;
}

export function sessionModeFromSettings(
  automaticTools: boolean,
  permissionMode?: PermissionMode | string,
): PermissionMode {
  if (isPermissionMode(permissionMode)) return permissionMode;
  return automaticTools ? "workspace-write" : "read-only";
}
