import type { Capability, PermissionMode, PermissionRule, PermissionScope } from "./types";
import { scopeCovers } from "./scope";

export type ModeDecision = "allow" | "ask" | "deny";

export function modeDecision(
  mode: PermissionMode,
  capability: Capability,
  confirmDestructive: boolean,
): ModeDecision {
  const read = capability === "filesystem.read" || capability === "git.read";
  const write = capability === "filesystem.write";
  const del = capability === "filesystem.delete";
  const network = capability === "network.search" || capability === "network.fetch";
  const mcp = capability === "mcp.invoke";

  if (mode === "read-only") {
    if (read) return "allow";
    if (network || mcp) return "ask";
    return "deny";
  }

  if (mode === "workspace-write") {
    if (read || write || capability === "terminal.execute") return "allow";
    if (del) return confirmDestructive ? "ask" : "allow";
    return "ask";
  }

  if (mcp) return "ask";
  if (del && confirmDestructive) return "ask";
  return "allow";
}

export function modeReason(mode: PermissionMode, capability: Capability, decision: ModeDecision): string {
  if (decision === "allow") return `Allowed by ${mode} mode.`;
  if (decision === "deny") return `Mode ${mode} does not allow ${capability}.`;
  return `Mode ${mode} requires approval for ${capability}.`;
}

export function ruleMatches(
  rule: PermissionRule,
  toolName: string,
  capability: Capability,
  input: unknown,
): boolean {
  if (rule.tool && rule.tool !== toolName) return false;
  if (rule.capability && rule.capability !== capability) return false;
  if (rule.scope && !scopeCovers(rule.scope, toolName, input)) return false;
  return Boolean(rule.tool || rule.capability || rule.scope);
}

export function firstMatchingRule(
  rules: readonly PermissionRule[],
  action: PermissionRule["action"],
  toolName: string,
  capability: Capability,
  input: unknown,
): PermissionRule | undefined {
  return rules.find((rule) => rule.action === action && ruleMatches(rule, toolName, capability, input));
}

export function allowRuleFromRequest(request: {
  tool: string;
  capability: Capability;
  scope: PermissionScope;
}): PermissionRule {
  return {
    action: "allow",
    tool: request.tool,
    capability: request.capability,
    scope: request.scope,
  };
}

export function sameAllowRule(left: PermissionRule, right: PermissionRule): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

export function upsertAllowRule(rules: readonly PermissionRule[], rule: PermissionRule): PermissionRule[] {
  if (rules.some((existing) => sameAllowRule(existing, rule))) return [...rules];
  return [...rules, rule];
}

export function describeAllowRule(rule: PermissionRule): string {
  const target = rule.tool ?? rule.capability ?? "Any tool";
  const scope = rule.scope ? describeScope(rule.scope) : "Any scope";
  return `${target} · ${scope}`;
}

export function describeScope(scope: PermissionScope): string {
  switch (scope.kind) {
    case "project":
      return "Project";
    case "paths":
      return `Paths: ${scope.prefixes.join(", ")}`;
    case "commands":
      return `Commands: ${scope.families.join(", ")}`;
    case "domains":
      return `Domains: ${scope.hosts.join(", ")}`;
    case "tools":
      return `Tools: ${scope.names.join(", ")}`;
  }
}
