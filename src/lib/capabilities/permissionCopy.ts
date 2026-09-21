import type { Capability as PermissionCapability } from "../agent/permissions/types";
import type { CapabilityPermission } from "./types";

interface PermissionCopy {
  group: string;
  action: string;
  scopeLabel: string;
  explanation: string;
}

const COPY: Record<PermissionCapability, PermissionCopy> = {
  "filesystem.read": {
    group: "Filesystem",
    action: "Read",
    scopeLabel: "Project scope",
    explanation: "This capability can read files inside the active project.",
  },
  "filesystem.write": {
    group: "Filesystem",
    action: "Write",
    scopeLabel: "Project scope",
    explanation: "This capability can create or edit files inside the active project.",
  },
  "filesystem.delete": {
    group: "Filesystem",
    action: "Delete",
    scopeLabel: "Project scope",
    explanation: "This capability can delete files inside the active project.",
  },
  "terminal.execute": {
    group: "Terminal",
    action: "Execute",
    scopeLabel: "Project commands",
    explanation: "This capability can run shell commands in the project workspace.",
  },
  "terminal.long_running": {
    group: "Terminal",
    action: "Long-running",
    scopeLabel: "Project commands",
    explanation: "This capability can start or stop long-running processes.",
  },
  "network.search": {
    group: "Network",
    action: "Search",
    scopeLabel: "Public web",
    explanation: "This capability can search the public web.",
  },
  "network.fetch": {
    group: "Network",
    action: "Fetch",
    scopeLabel: "Public URLs",
    explanation: "This capability can fetch content from public URLs.",
  },
  "git.read": {
    group: "Git",
    action: "Read",
    scopeLabel: "Current repository",
    explanation: "This capability can inspect git status and diffs in the current repository.",
  },
  "git.write": {
    group: "Git",
    action: "Write",
    scopeLabel: "Current repository",
    explanation: "This capability can create commits or otherwise mutate git state.",
  },
  "applications.execute": {
    group: "Application",
    action: "Execute",
    scopeLabel: "Host applications",
    explanation: "This capability can launch or control host applications.",
  },
  "mcp.invoke": {
    group: "MCP",
    action: "Invoke",
    scopeLabel: "Connected servers",
    explanation: "This capability can call tools exposed by a connected MCP server.",
  },
};

const GROUPS = ["Filesystem", "Network", "Terminal", "Git", "Application", "MCP"] as const;

export function describePermission(capability: PermissionCapability): PermissionCopy {
  return COPY[capability];
}

export function permissionRows(
  capability: PermissionCapability,
  options?: { allowed?: boolean; approval?: string },
): CapabilityPermission[] {
  const active = COPY[capability];
  const allowed = options?.allowed !== false;
  const rows: CapabilityPermission[] = GROUPS.map((group) => {
    if (group === active.group) {
      return {
        id: capability,
        group,
        action: active.action,
        allowed,
        scopeLabel: active.scopeLabel,
        explanation: active.explanation,
      };
    }
    return {
      id: `${group.toLowerCase()}.none`,
      group,
      action: "None",
      allowed: false,
      scopeLabel: "",
      explanation: `This capability cannot use ${group.toLowerCase()}.`,
    };
  });
  rows.push({
    id: "approval",
    group: "Approval",
    action: options?.approval === "auto" ? "Automatic" : options?.approval === "confirm-destructive" ? "Confirm destructive" : "Ask",
    allowed: true,
    scopeLabel: "",
    explanation: options?.approval === "auto"
      ? "Calls run without an extra confirmation when the current permission mode allows them."
      : "The agent must ask before using this capability.",
  });
  return rows;
}

export function redactCapabilityText(value: string) {
  return value
    .replace(/\b(sk|pk|ghp|gho|github_pat|xox[baprs])-[A-Za-z0-9_-]{8,}\b/g, "[redacted]")
    .replace(/\b(api[_-]?key|token|password|secret)\s*=\s*\S+/gi, "$1=[redacted]")
    .replace(/\b(api[_-]?key|token|password|secret):\s+\S+/gi, "$1=[redacted]")
    .replace(/\bsecret:\/\/\S+/g, "secret://[ref]");
}
