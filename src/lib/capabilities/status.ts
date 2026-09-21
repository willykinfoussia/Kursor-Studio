import type { ToolCategory } from "../agent/ToolRegistry";
import type { CapabilityConnectionStatus, CapabilityStatus, ToolCapabilityCategory } from "./types";
import type { MCPServerStatus } from "../mcp/types";

export function uiToolCategory(category: ToolCategory): ToolCapabilityCategory {
  if (category === "process") return "terminal";
  if (category === "network") return "web";
  if (category === "mcp") return "agent";
  return category;
}

export function mcpConnectionStatus(status: MCPServerStatus, enabled: boolean): CapabilityConnectionStatus {
  if (!enabled) return "disabled";
  if (status === "error") return "error";
  if (status === "ready" || status === "connected") return "connected";
  return "disconnected";
}

export function mcpCapabilityStatus(status: MCPServerStatus, enabled: boolean): CapabilityStatus {
  if (!enabled) return "disabled";
  if (status === "error") return "error";
  if (status === "ready" || status === "connected") return "enabled";
  return "unavailable";
}

export function capabilityStatus(enabled: boolean, available = true, error = false): CapabilityStatus {
  if (error) return "error";
  if (!enabled) return "disabled";
  if (!available) return "unavailable";
  return "enabled";
}
