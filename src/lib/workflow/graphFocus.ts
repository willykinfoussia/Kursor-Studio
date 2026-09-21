import type { AgentGraphEdge, AgentGraphNode } from "./types";
import { PIPELINE_IDS, isEngineLayer, isPackedLoopChild } from "./pipelineSchema";

export interface GraphFocus {
  id: string;
  label: string;
}

export function drillTargetOf(node: Pick<AgentGraphNode, "metadata"> | null | undefined) {
  const target = node?.metadata?.drillTarget;
  return typeof target === "string" && target ? target : undefined;
}

export function canDrillNode(node: AgentGraphNode, allNodes: readonly AgentGraphNode[]) {
  if (drillTargetOf(node)) return true;
  if (node.id === PIPELINE_IDS.loop) {
    return allNodes.some((item) => item.parentId === node.id && isEngineLayer(item));
  }
  return allNodes.some((item) => item.parentId === node.id);
}

export function resolveFocusParentId(focus: GraphFocus, nodes: readonly AgentGraphNode[]) {
  const node = nodes.find((item) => item.id === focus.id);
  return drillTargetOf(node) ?? focus.id;
}

export function focusedGraph(
  nodes: readonly AgentGraphNode[],
  edges: readonly AgentGraphEdge[],
  stack: readonly GraphFocus[],
): { nodes: AgentGraphNode[]; edges: AgentGraphEdge[] } {
  const focus = stack.at(-1);
  const parentId = focus ? resolveFocusParentId(focus, nodes) : null;
  const layer = parentId
    ? nodes.filter((node) => (
      node.parentId === parentId
      && (parentId !== PIPELINE_IDS.loop || isEngineLayer(node))
    ))
    : [
      ...nodes.filter((node) => !node.parentId),
      ...nodes.filter((node) => isPackedLoopChild(node)),
    ];
  const ids = new Set(layer.map((node) => node.id));
  return {
    nodes: layer.map((node) => ({
      ...node,
      parentId: parentId ? undefined : node.parentId,
      metadata: { ...node.metadata, canDrill: canDrillNode(node, nodes) },
    })),
    edges: edges.filter((edge) => ids.has(edge.source) && ids.has(edge.target)),
  };
}

export function focusStackForNode(nodeId: string, nodes: readonly AgentGraphNode[]): GraphFocus[] {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const node = byId.get(nodeId);
  if (!node?.parentId) return [];
  if (isPackedLoopChild(node)) return [];
  const stack: GraphFocus[] = [];
  let current = byId.get(node.parentId);
  const seen = new Set<string>();
  while (current && !seen.has(current.id)) {
    seen.add(current.id);
    stack.unshift({ id: current.id, label: current.label });
    current = current.parentId ? byId.get(current.parentId) : undefined;
  }
  return stack;
}

export function followVisibleId(
  runningId: string,
  visibleIds: ReadonlySet<string>,
  nodes: readonly AgentGraphNode[],
) {
  if (visibleIds.has(runningId)) return runningId;
  const byId = new Map(nodes.map((node) => [node.id, node]));
  let current = byId.get(runningId);
  const seen = new Set<string>();
  while (current && !seen.has(current.id)) {
    seen.add(current.id);
    if (visibleIds.has(current.id)) return current.id;
    for (const id of visibleIds) {
      const visible = byId.get(id);
      if (visible && drillTargetOf(visible) === current.id) return id;
    }
    current = current.parentId ? byId.get(current.parentId) : undefined;
  }
  return null;
}
