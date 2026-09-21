import type { AgentGraphNode } from "../workflow/types";
import {
  builtinToolCapabilityId,
  capabilityIdFromRuntimeTool,
  mcpServerCapabilityId,
  parseRuntimeToolName,
  skillCapabilityId,
} from "./ids";
import type { CapabilityType } from "./types";

export function capabilityIdFromNode(node: AgentGraphNode): string | null {
  const meta = node.metadata ?? {};
  if (typeof meta.capabilityId === "string" && meta.capabilityId) return meta.capabilityId;
  if (node.type === "skill") {
    const skillId = typeof meta.skillId === "string" ? meta.skillId : node.id.replace(/^skill:/, "");
    const origin = meta.origin === "project" || meta.origin === "user" || meta.origin === "global"
      ? meta.origin
      : "builtin";
    return skillCapabilityId(origin, skillId);
  }
  if (node.type === "mcp_server") {
    const serverId = typeof meta.mcpServerId === "string" ? meta.mcpServerId : node.id.replace(/^mcp-server:/, "");
    return mcpServerCapabilityId(serverId);
  }
  if (node.type === "mcp_tool") {
    const serverId = typeof meta.mcpServerId === "string" ? meta.mcpServerId : "";
    const toolName = typeof meta.mcpToolName === "string" ? meta.mcpToolName : node.label;
    if (serverId && toolName) return capabilityIdFromRuntimeTool(`mcp__${serverId}__${toolName}`);
  }
  if (
    node.type === "tool"
    || node.type === "file"
    || node.type === "command"
    || node.type === "git"
    || node.type === "web_search"
    || node.type === "web_page"
  ) {
    const tool = typeof meta.tool === "string" ? meta.tool : node.label;
    const parsed = parseRuntimeToolName(tool);
    if (parsed) return capabilityIdFromRuntimeTool(tool);
    return builtinToolCapabilityId(tool);
  }
  return null;
}

export function capabilityTypeFromNode(node: AgentGraphNode): CapabilityType | null {
  if (typeof node.metadata?.capabilityType === "string") {
    const type = node.metadata.capabilityType;
    if (type === "skill" || type === "tool" || type === "mcp") return type;
  }
  if (node.type === "skill") return "skill";
  if (node.type === "mcp_server" || node.type === "mcp_tool" || node.type === "mcp_resource" || node.type === "mcp_prompt") {
    return "mcp";
  }
  if (
    node.type === "tool"
    || node.type === "file"
    || node.type === "command"
    || node.type === "git"
    || node.type === "web_search"
    || node.type === "web_page"
  ) {
    const tool = typeof node.metadata?.tool === "string" ? node.metadata.tool : node.label;
    return parseRuntimeToolName(tool) ? "mcp" : "tool";
  }
  return null;
}

export function capabilityRefMetadata(node: AgentGraphNode) {
  const capabilityId = capabilityIdFromNode(node);
  const capabilityType = capabilityTypeFromNode(node);
  if (!capabilityId || !capabilityType) return {};
  return {
    capabilityId,
    capabilityType,
    usageInstanceId: node.id,
  };
}
