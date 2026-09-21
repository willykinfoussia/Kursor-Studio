import dagre from "@dagrejs/dagre";
import type { AgentGraphNode, AgentGraphNodeType, GraphLayoutName } from "./types";
import type { AgentGraphEdge } from "./types";

export interface LaidOutNode {
  id: string;
  position: { x: number; y: number };
  width: number;
  height: number;
}

const SIZES: Record<"small" | "medium" | "large", { width: number; height: number }> = {
  small: { width: 168, height: 52 },
  medium: { width: 210, height: 68 },
  large: { width: 240, height: 84 },
};

const CHILD_GAP = 28;
const STAGE_GAP = 112;
const ORIGIN_X = 24;
const ORIGIN_Y = 48;
const LOOP_ROUTE_PAD = 56;

const CHAIN_EDGE_TYPES = new Set(["sequence", "delegation", "fallback"]);
const HANG_EDGE_TYPES = new Set(["recovery"]);

export function nodeSize(type: AgentGraphNodeType) {
  if (type === "agent" || type === "subagent") return SIZES.large;
  if (type === "tool" || type === "file" || type === "git" || type === "command" || type === "web_search" || type === "web_page" || type === "mcp_tool") {
    return SIZES.small;
  }
  if (type === "mcp_server") return SIZES.medium;
  return SIZES.medium;
}

function storedPosition(node: AgentGraphNode) {
  const stored = node.metadata?.position;
  if (stored && typeof stored === "object" && "x" in stored && "y" in stored) {
    return { x: Number(stored.x) || 0, y: Number(stored.y) || 0 };
  }
  return { x: 0, y: 0 };
}

function childOrder(left: AgentGraphNode, right: AgentGraphNode) {
  const a = storedPosition(left);
  const b = storedPosition(right);
  if (a.x !== b.x) return a.x - b.x;
  return a.y - b.y;
}

function layoutRanks(
  comp: string[],
  chainEdges: readonly AgentGraphEdge[],
  children: readonly AgentGraphNode[],
): string[][] {
  const inComp = new Set(comp);
  const remaining = new Map(comp.map((id) => [id, 0]));
  const outgoing = new Map(comp.map((id) => [id, [] as string[]]));
  for (const edge of chainEdges) {
    if (!inComp.has(edge.source) || !inComp.has(edge.target)) continue;
    outgoing.get(edge.source)?.push(edge.target);
    remaining.set(edge.target, (remaining.get(edge.target) ?? 0) + 1);
  }
  const orderIndex = new Map(children.map((child, index) => [child.id, index]));
  const byIndex = (left: string, right: string) => (orderIndex.get(left) ?? 0) - (orderIndex.get(right) ?? 0);
  let ready = comp.filter((id) => (remaining.get(id) ?? 0) === 0).sort(byIndex);
  const ranks: string[][] = [];
  const assigned = new Set<string>();
  while (ready.length) {
    ranks.push([...ready]);
    const nextReady: string[] = [];
    for (const id of ready) {
      assigned.add(id);
      for (const next of outgoing.get(id) ?? []) {
        remaining.set(next, (remaining.get(next) ?? 1) - 1);
        if (remaining.get(next) === 0 && !assigned.has(next)) nextReady.push(next);
      }
    }
    ready = [...new Set(nextReady)].sort(byIndex);
  }
  for (const id of comp) {
    if (!assigned.has(id)) ranks.push([id]);
  }
  return ranks;
}

const PACK_PAD = 20;

function layoutPipelineFlat(
  nodes: readonly AgentGraphNode[],
  edges: readonly AgentGraphEdge[] = [],
  sizeOverrides?: ReadonlyMap<string, { width: number; height: number }>,
): Map<string, LaidOutNode> {
  const children = [...nodes].sort(childOrder);
  const sizes = new Map(children.map((node) => {
    const override = sizeOverrides?.get(node.id);
    return [node.id, override ?? nodeSize(node.type)] as const;
  }));
  const relPos = new Map<string, { x: number; y: number }>();
  const childIds = new Set(children.map((child) => child.id));
  const siblingEdges = edges.filter((edge) => childIds.has(edge.source) && childIds.has(edge.target));
  const chainEdges = siblingEdges.filter((edge) => CHAIN_EDGE_TYPES.has(edge.type));
  const hangEdges = siblingEdges.filter((edge) => HANG_EDGE_TYPES.has(edge.type));

  const undirected = new Map<string, string[]>();
  for (const child of children) undirected.set(child.id, []);
  for (const edge of chainEdges) {
    undirected.get(edge.source)?.push(edge.target);
    undirected.get(edge.target)?.push(edge.source);
  }

  const chained = new Set<string>();
  const components: string[][] = [];
  for (const child of children) {
    if (chained.has(child.id)) continue;
    const linked = chainEdges.some((edge) => edge.source === child.id || edge.target === child.id);
    if (!linked) continue;
    const stack = [child.id];
    const comp: string[] = [];
    chained.add(child.id);
    while (stack.length) {
      const id = stack.pop();
      if (!id) break;
      comp.push(id);
      for (const next of undirected.get(id) ?? []) {
        if (chained.has(next)) continue;
        chained.add(next);
        stack.push(next);
      }
    }
    components.push(comp);
  }

  const hangTargets = new Set(hangEdges.map((edge) => edge.target));
  const isolated = children.filter((child) => !chained.has(child.id) && !hangTargets.has(child.id));
  const contextPad = siblingEdges.some((edge) => edge.type === "context") ? LOOP_ROUTE_PAD : 0;
  const childY = ORIGIN_Y + contextPad;

  let cursorX = ORIGIN_X;
  if (isolated.length) {
    let colY = childY;
    let colW = 0;
    for (const child of isolated) {
      const size = sizes.get(child.id) ?? SIZES.medium;
      relPos.set(child.id, { x: ORIGIN_X, y: colY });
      colY += size.height + CHILD_GAP;
      colW = Math.max(colW, size.width);
    }
    cursorX = ORIGIN_X + colW + STAGE_GAP;
  }

  for (const comp of components) {
    const ranks = layoutRanks(comp, chainEdges, children);
    for (const rank of ranks) {
      let colY = childY;
      let colW = 0;
      for (const id of rank) {
        const size = sizes.get(id) ?? SIZES.medium;
        relPos.set(id, { x: cursorX, y: colY });
        colY += size.height + CHILD_GAP;
        colW = Math.max(colW, size.width);
      }
      cursorX += colW + STAGE_GAP;
    }
  }

  for (const edge of hangEdges) {
    const sourcePos = relPos.get(edge.source);
    const sourceSize = sizes.get(edge.source);
    if (!sourcePos || !sourceSize || !sizes.has(edge.target)) continue;
    relPos.set(edge.target, {
      x: sourcePos.x + sourceSize.width + STAGE_GAP,
      y: sourcePos.y + sourceSize.height + CHILD_GAP,
    });
  }

  const positions = new Map<string, LaidOutNode>();
  for (const node of nodes) {
    const size = sizes.get(node.id) ?? nodeSize(node.type);
    const position = relPos.get(node.id) ?? { x: ORIGIN_X, y: ORIGIN_Y };
    positions.set(node.id, { id: node.id, position, ...size });
  }
  return positions;
}

export function layoutPipeline(
  nodes: readonly AgentGraphNode[],
  edges: readonly AgentGraphEdge[] = [],
): Map<string, LaidOutNode> {
  const ids = new Set(nodes.map((node) => node.id));
  const packed = nodes.filter((node) => node.parentId && ids.has(node.parentId));
  if (packed.length === 0) return layoutPipelineFlat(nodes, edges);

  const roots = nodes.filter((node) => !node.parentId || !ids.has(node.parentId));
  const overrides = new Map<string, { width: number; height: number }>();
  const result = new Map<string, LaidOutNode>();

  for (const parent of roots) {
    const children = packed.filter((node) => node.parentId === parent.id);
    if (children.length === 0) continue;
    const childIds = new Set(children.map((child) => child.id));
    const innerEdges = edges.filter((edge) => childIds.has(edge.source) && childIds.has(edge.target));
    const inner = layoutPipelineFlat(children, innerEdges);
    let maxX = 0;
    let maxY = 0;
    for (const child of children) {
      const placed = inner.get(child.id);
      if (!placed) continue;
      result.set(child.id, placed);
      maxX = Math.max(maxX, placed.position.x + placed.width);
      maxY = Math.max(maxY, placed.position.y + placed.height);
    }
    const min = nodeSize(parent.type);
    overrides.set(parent.id, {
      width: Math.max(min.width, maxX + PACK_PAD),
      height: Math.max(min.height, maxY + PACK_PAD),
    });
  }

  const rootEdges = edges.filter((edge) => ids.has(edge.source) && ids.has(edge.target) && !packed.some((node) => node.id === edge.source || node.id === edge.target));
  const rootLayout = layoutPipelineFlat(roots, rootEdges, overrides);
  for (const [id, laid] of rootLayout) result.set(id, laid);
  return result;
}

export function layoutGraph(
  nodes: readonly AgentGraphNode[],
  edges: readonly AgentGraphEdge[],
  layout: GraphLayoutName = "dag",
  mode: "pipeline" | "trace" = "trace",
): Map<string, LaidOutNode> {
  if (mode === "pipeline") return layoutPipeline(nodes, edges);
  const graph = new dagre.graphlib.Graph();
  graph.setDefaultEdgeLabel(() => ({}));
  graph.setGraph({
    rankdir: layout === "tree" ? "TB" : "LR",
    nodesep: 36,
    ranksep: 72,
    edgesep: 16,
    marginx: 24,
    marginy: 24,
  });

  for (const node of nodes) {
    const size = nodeSize(node.type);
    graph.setNode(node.id, { width: size.width, height: size.height });
  }
  for (const edge of edges) {
    if (graph.node(edge.source) && graph.node(edge.target)) {
      graph.setEdge(edge.source, edge.target);
    }
  }
  dagre.layout(graph);

  const positions = new Map<string, LaidOutNode>();
  for (const node of nodes) {
    const placed = graph.node(node.id);
    const size = nodeSize(node.type);
    if (!placed) {
      positions.set(node.id, { id: node.id, position: { x: 0, y: 0 }, ...size });
      continue;
    }
    positions.set(node.id, {
      id: node.id,
      position: { x: placed.x - size.width / 2, y: placed.y - size.height / 2 },
      ...size,
    });
  }
  return positions;
}
