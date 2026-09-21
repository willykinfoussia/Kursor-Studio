import type { AgentGraphNode } from "./types";

export interface GraphSearchHit {
  nodeId: string;
  label: string;
  type: AgentGraphNode["type"];
}

export function searchGraphNodes(nodes: readonly AgentGraphNode[], query: string): GraphSearchHit[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return [];
  const hits: GraphSearchHit[] = [];
  for (const node of nodes) {
    const haystack = [
      node.label,
      node.type,
      node.id,
      node.status,
      node.type === "error" ? "error" : "",
      stringifyMeta(node.metadata),
    ].join(" ").toLowerCase();
    if (haystack.includes(needle)) {
      hits.push({ nodeId: node.id, label: node.label, type: node.type });
    }
  }
  return hits.slice(0, 40);
}

function stringifyMeta(meta?: Record<string, unknown>) {
  if (!meta) return "";
  const parts: string[] = [];
  for (const [key, value] of Object.entries(meta)) {
    if (value === undefined || value === null) continue;
    if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
      parts.push(`${key} ${String(value)}`);
    }
  }
  return parts.join(" ");
}
