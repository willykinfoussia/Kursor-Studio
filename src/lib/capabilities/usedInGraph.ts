import { capabilityIdFromNode, capabilityTypeFromNode } from "./fromGraph";
import { mcpServerCapabilityId } from "./ids";
import type { CapabilityType } from "./types";
import type { AgentGraphNode } from "../workflow/types";

export interface UsedCapabilityGroup {
  capabilityId: string;
  type: CapabilityType;
  name: string;
  count: number;
  usageInstanceIds: string[];
}

export function capabilitiesUsedInGraph(nodes: readonly AgentGraphNode[]) {
  const groups = new Map<string, UsedCapabilityGroup>();
  for (const node of nodes) {
    if (node.type === "mcp_server") continue;
    const type = capabilityTypeFromNode(node);
    if (!type) continue;
    const meta = node.metadata ?? {};
    const capabilityId = type === "mcp" && typeof meta.mcpServerId === "string"
      ? mcpServerCapabilityId(meta.mcpServerId)
      : capabilityIdFromNode(node);
    if (!capabilityId) continue;
    const name = type === "mcp" && typeof meta.mcpServerId === "string"
      ? String(meta.mcpServerId)
      : node.label;
    const existing = groups.get(capabilityId);
    if (existing) {
      existing.count += 1;
      existing.usageInstanceIds.push(node.id);
      continue;
    }
    groups.set(capabilityId, {
      capabilityId,
      type,
      name,
      count: 1,
      usageInstanceIds: [node.id],
    });
  }
  const items = [...groups.values()];
  return {
    skills: items.filter((item) => item.type === "skill"),
    tools: items.filter((item) => item.type === "tool"),
    mcp: items.filter((item) => item.type === "mcp"),
    all: items,
  };
}
