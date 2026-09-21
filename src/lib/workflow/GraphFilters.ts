import { FILTER_NODE_TYPES, type AgentGraphEdge, type AgentGraphNode, type AgentGraphNodeType, type GraphFilterCategory, type ProjectedGraph } from "./types";

export function hiddenTypes(filters: Record<GraphFilterCategory, boolean>): Set<AgentGraphNodeType> {
  const hidden = new Set<AgentGraphNodeType>();
  for (const [category, enabled] of Object.entries(filters) as [GraphFilterCategory, boolean][]) {
    if (enabled) continue;
    for (const type of FILTER_NODE_TYPES[category]) hidden.add(type);
  }
  return hidden;
}

export function applyGraphFilters(
  graph: ProjectedGraph,
  filters: Record<GraphFilterCategory, boolean>,
  collapsedGroups: ReadonlySet<string> = new Set(),
): { nodes: AgentGraphNode[]; edges: AgentGraphEdge[] } {
  const hidden = hiddenTypes(filters);
  const collapsedChildren = new Set<string>();
  const byParent = new Map<string, string[]>();
  for (const node of graph.nodes) {
    if (!node.parentId) continue;
    const list = byParent.get(node.parentId) ?? [];
    list.push(node.id);
    byParent.set(node.parentId, list);
  }
  const walk = (id: string) => {
    for (const childId of byParent.get(id) ?? []) {
      collapsedChildren.add(childId);
      walk(childId);
    }
  };
  for (const node of graph.nodes) {
    if (collapsedGroups.has(node.id) && (node.type === "tool_group" || node.type === "mcp_server" || node.metadata?.isParent === true)) {
      const childIds = Array.isArray(node.metadata?.childIds) ? node.metadata.childIds as string[] : [];
      for (const childId of childIds) collapsedChildren.add(childId);
      walk(node.id);
    }
  }

  const visible = graph.nodes.filter((node) => {
    if (hidden.has(node.type)) return false;
    if (collapsedChildren.has(node.id)) return false;
    return true;
  });
  const visibleIds = new Set(visible.map((node) => node.id));
  const shortcuts = shortcutEdges(graph.edges, visibleIds, new Set(graph.nodes.map((node) => node.id)));
  return { nodes: visible, edges: shortcuts };
}

export function shortcutEdges(
  edges: readonly AgentGraphEdge[],
  visibleIds: ReadonlySet<string>,
  allIds: ReadonlySet<string>,
): AgentGraphEdge[] {
  const outgoing = new Map<string, AgentGraphEdge[]>();
  for (const edge of edges) {
    const list = outgoing.get(edge.source) ?? [];
    list.push(edge);
    outgoing.set(edge.source, list);
  }

  const result = new Map<string, AgentGraphEdge>();

  const walk = (start: string, from: AgentGraphEdge, seen: Set<string>) => {
    const next = outgoing.get(start) ?? [];
    if (next.length === 0) return;
    for (const edge of next) {
      if (seen.has(edge.id)) continue;
      seen.add(edge.id);
      if (visibleIds.has(edge.target)) {
        const id = `${from.type}:${from.source}->${edge.target}`;
        if (!result.has(id) && from.source !== edge.target && visibleIds.has(from.source)) {
          result.set(id, {
            ...from,
            id,
            target: edge.target,
            metadata: { ...from.metadata, shortcut: from.target !== edge.target },
          });
        }
      } else if (allIds.has(edge.target)) {
        walk(edge.target, from, seen);
      }
    }
  };

  for (const edge of edges) {
    if (visibleIds.has(edge.source) && visibleIds.has(edge.target)) {
      result.set(edge.id, edge);
      continue;
    }
    if (visibleIds.has(edge.source) && !visibleIds.has(edge.target)) {
      walk(edge.target, edge, new Set([edge.id]));
    }
  }

  return [...result.values()];
}
