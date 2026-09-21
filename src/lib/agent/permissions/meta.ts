import type { ToolApproval, ToolCategory, ToolRisk } from "../ToolRegistry";
import type { Capability, RiskLevel } from "./types";

export function deriveToolCategory(capability: Capability): ToolCategory {
  if (capability.startsWith("filesystem.")) return "filesystem";
  if (capability.startsWith("git.")) return "git";
  if (capability.startsWith("network.")) return "network";
  if (capability === "mcp.invoke") return "mcp";
  return "process";
}

export function deriveToolRisk(capability: Capability): ToolRisk {
  switch (capability) {
    case "filesystem.read":
      return "read";
    case "filesystem.write":
    case "filesystem.delete":
      return "write";
    case "git.read":
    case "git.write":
      return "git";
    case "network.search":
    case "network.fetch":
      return "network";
    default:
      return "execute";
  }
}

export function deriveToolApproval(capability: Capability): ToolApproval {
  if (capability === "filesystem.delete") return "confirm-destructive";
  if (
    capability === "terminal.execute"
    || capability === "terminal.long_running"
    || capability === "applications.execute"
    || capability === "network.search"
    || capability === "network.fetch"
    || capability === "git.write"
    || capability === "mcp.invoke"
  ) {
    return "ask";
  }
  return "auto";
}

export function toolPermission(capability: Capability, riskLevel: RiskLevel) {
  return {
    capability,
    riskLevel,
    category: deriveToolCategory(capability),
    risk: deriveToolRisk(capability),
    approval: deriveToolApproval(capability),
  };
}
