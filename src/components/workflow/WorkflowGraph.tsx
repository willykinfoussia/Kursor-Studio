import { useCallback, useEffect, useMemo, useRef } from "react";
import {
  Background,
  BackgroundVariant,
  MiniMap,
  ReactFlow,
  useReactFlow,
  type Edge,
  type Node,
} from "@xyflow/react";
import { capabilityIdFromNode } from "../../lib/capabilities/fromGraph";
import { canDrillNode, followVisibleId } from "../../lib/workflow/graphFocus";
import { layoutGraph } from "../../lib/workflow/GraphLayout";
import { isPipelineParent } from "../../lib/workflow/pipelineSchema";
import type { AgentGraphEdge, AgentGraphNode } from "../../lib/workflow/types";
import { useWorkflowStore } from "../../stores/workflowStore";
import { workflowEdgeTypes } from "./WorkflowEdge";
import { rfNodeType, workflowNodeTypes } from "./nodes/WorkflowNodes";

const MIN_ZOOM = 0.15;
const MAX_ZOOM = 1.6;

function descendantsOf(rootId: string, nodes: readonly AgentGraphNode[]) {
  const ids = new Set<string>();
  const walk = (id: string) => {
    for (const node of nodes) {
      if (node.parentId !== id || ids.has(node.id)) continue;
      ids.add(node.id);
      walk(node.id);
    }
  };
  walk(rootId);
  return ids;
}

function absoluteCenter(
  id: string,
  nodes: readonly AgentGraphNode[],
  positions: Map<string, { position: { x: number; y: number }; width: number; height: number }>,
) {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  let x = 0;
  let y = 0;
  let current: string | undefined = id;
  const seen = new Set<string>();
  while (current && !seen.has(current)) {
    seen.add(current);
    const placed = positions.get(current);
    if (!placed) break;
    x += placed.position.x;
    y += placed.position.y;
    current = byId.get(current)?.parentId;
  }
  const box = positions.get(id);
  return { x: x + (box?.width ?? 0) / 2, y: y + (box?.height ?? 0) / 2 };
}

export function WorkflowGraph({
  nodes,
  edges,
  allNodes,
}: {
  nodes: AgentGraphNode[];
  edges: AgentGraphEdge[];
  allNodes: AgentGraphNode[];
}) {
  const selectedNodeId = useWorkflowStore((state) => state.selectedNodeId);
  const selectedEdgeId = useWorkflowStore((state) => state.selectedEdgeId);
  const followAgent = useWorkflowStore((state) => state.followAgent);
  const centerRequest = useWorkflowStore((state) => state.centerRequest);
  const layoutName = useWorkflowStore((state) => state.layout);
  const canvasMode = useWorkflowStore((state) => state.canvasMode);
  const focusStack = useWorkflowStore((state) => state.focusStack);
  const selectNode = useWorkflowStore((state) => state.selectNode);
  const selectEdge = useWorkflowStore((state) => state.selectEdge);
  const toggleGroup = useWorkflowStore((state) => state.toggleGroup);
  const enterFocus = useWorkflowStore((state) => state.enterFocus);
  const exitFocus = useWorkflowStore((state) => state.exitFocus);
  const collapsedGroups = useWorkflowStore((state) => state.collapsedGroups);
  const markUserMovedViewport = useWorkflowStore((state) => state.markUserMovedViewport);
  const requestCenter = useWorkflowStore((state) => state.requestCenter);
  const clearSelection = useWorkflowStore((state) => state.clearSelection);
  const setHighlightedCapabilityId = useWorkflowStore((state) => state.setHighlightedCapabilityId);
  const { fitView, setCenter, getViewport, setViewport } = useReactFlow();
  const hostRef = useRef<HTMLDivElement>(null);

  const hidden = useMemo(() => {
    if (canvasMode === "pipeline") return new Set<string>();
    const ids = new Set<string>();
    for (const node of nodes) {
      if (!collapsedGroups[node.id]) continue;
      for (const childId of descendantsOf(node.id, nodes)) ids.add(childId);
    }
    return ids;
  }, [nodes, collapsedGroups, canvasMode]);

  const visibleNodes = useMemo(() => nodes.filter((node) => !hidden.has(node.id)), [nodes, hidden]);
  const visibleEdges = useMemo(
    () => edges.filter((edge) => !hidden.has(edge.source) && !hidden.has(edge.target)),
    [edges, hidden],
  );

  const positions = useMemo(
    () => layoutGraph(visibleNodes, visibleEdges, layoutName, canvasMode),
    [visibleNodes, visibleEdges, layoutName, canvasMode],
  );

  useEffect(() => {
    void fitView({ padding: 0.16, duration: 180 });
  }, [canvasMode, focusStack, fitView]);

  const rfNodes: Node[] = useMemo(() => visibleNodes.map((node) => {
    const placed = positions.get(node.id);
    const nested = Boolean(node.parentId)
      && visibleNodes.some((item) => item.id === node.parentId);
    const isGroup = visibleNodes.some((item) => item.parentId === node.id);
    return {
      id: node.id,
      type: rfNodeType(node.type),
      position: placed?.position ?? { x: 0, y: 0 },
      data: { node },
      selected: node.id === selectedNodeId,
      draggable: false,
      parentId: nested ? node.parentId : undefined,
      extent: nested ? "parent" : undefined,
      style: isGroup && placed ? { width: placed.width, height: placed.height } : undefined,
      zIndex: isGroup ? 0 : 1,
      className: collapsedGroups[node.id] ? "collapsed" : undefined,
    };
  }), [visibleNodes, positions, selectedNodeId, collapsedGroups, canvasMode]);

  const rfEdges: Edge[] = useMemo(() => visibleEdges.map((edge) => ({
    id: edge.id,
    source: edge.source,
    target: edge.target,
    sourceHandle: edge.type === "loop" ? "loop" : edge.type === "context" ? "context" : undefined,
    targetHandle: edge.type === "loop" ? "loop" : edge.type === "context" ? "context" : undefined,
    type: "workflow",
    data: { edge },
    selected: edge.id === selectedEdgeId,
  })), [visibleEdges, selectedEdgeId]);

  const running = allNodes.find((node) => node.status === "running");
  const visibleIds = useMemo(() => new Set(visibleNodes.map((node) => node.id)), [visibleNodes]);
  const followId = running
    ? followVisibleId(running.id, visibleIds, allNodes) ?? (visibleIds.has(running.id) ? running.id : null)
    : null;

  useEffect(() => {
    if (!followAgent || !followId) return;
    const center = absoluteCenter(followId, visibleNodes, positions);
    void setCenter(center.x, center.y, { zoom: 1, duration: 220 });
  }, [followAgent, followId, positions, visibleNodes, setCenter]);

  useEffect(() => {
    if (!centerRequest) return;
    const target = visibleIds.has(centerRequest)
      ? centerRequest
      : followVisibleId(centerRequest, visibleIds, allNodes);
    if (target && positions.get(target)) {
      const center = absoluteCenter(target, visibleNodes, positions);
      void setCenter(center.x, center.y, { zoom: 1.05, duration: 220 });
    }
    requestCenter(null);
  }, [centerRequest, positions, visibleNodes, visibleIds, allNodes, requestCenter, setCenter]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        if (canvasMode === "pipeline" && focusStack.length > 0) {
          exitFocus();
          return;
        }
        clearSelection();
        return;
      }
      if (event.key !== "Enter" || canvasMode !== "pipeline") return;
      const tag = (event.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || tag === "BUTTON") return;
      const selected = allNodes.find((node) => node.id === selectedNodeId)
        ?? visibleNodes.find((node) => node.id === selectedNodeId);
      if (selected && canDrillNode(selected, allNodes)) enterFocus({ id: selected.id, label: selected.label });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [allNodes, canvasMode, clearSelection, enterFocus, exitFocus, focusStack.length, selectedNodeId, visibleNodes]);

  const zoomAtPointer = useCallback((event: WheelEvent) => {
    const host = hostRef.current;
    if (!host) return;
    const { x, y, zoom } = getViewport();
    const sensitivity = event.deltaMode === 1 ? 0.05 : 0.002;
    const nextZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom * 2 ** (-event.deltaY * sensitivity)));
    if (nextZoom === zoom) return;
    const rect = host.getBoundingClientRect();
    const cx = event.clientX - rect.left;
    const cy = event.clientY - rect.top;
    const worldX = (cx - x) / zoom;
    const worldY = (cy - y) / zoom;
    void setViewport({
      zoom: nextZoom,
      x: cx - worldX * nextZoom,
      y: cy - worldY * nextZoom,
    });
    markUserMovedViewport();
  }, [getViewport, setViewport, markUserMovedViewport]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      event.stopPropagation();
      zoomAtPointer(event);
    };
    host.addEventListener("wheel", onWheel, { passive: false, capture: true });
    return () => host.removeEventListener("wheel", onWheel, { capture: true });
  }, [zoomAtPointer]);

  return (
    <div ref={hostRef} className="wf-flow-host">
      <ReactFlow
        nodes={rfNodes}
        edges={rfEdges}
        nodeTypes={workflowNodeTypes}
        edgeTypes={workflowEdgeTypes}
        nodesConnectable={false}
        elementsSelectable
        panOnDrag
        zoomOnScroll={false}
        zoomOnPinch={false}
        preventScrolling
        minZoom={MIN_ZOOM}
        maxZoom={MAX_ZOOM}
        onMoveStart={() => markUserMovedViewport()}
        onNodeClick={(_, node) => {
          selectNode(node.id);
          const match = allNodes.find((item) => item.id === node.id) ?? nodes.find((item) => item.id === node.id);
          const capabilityId = match ? capabilityIdFromNode(match) : null;
          setHighlightedCapabilityId(capabilityId);
        }}
        onNodeDoubleClick={(_, node) => {
          const match = allNodes.find((item) => item.id === node.id) ?? nodes.find((item) => item.id === node.id);
          if (!match) return;
          if (canvasMode === "pipeline" && canDrillNode(match, allNodes)) {
            enterFocus({ id: match.id, label: match.label });
            return;
          }
          if (canvasMode === "trace" && (match.type === "tool_group" || isPipelineParent(match))) {
            toggleGroup(node.id);
          }
        }}
        onEdgeClick={(_, edge) => selectEdge(edge.id)}
        onPaneClick={() => clearSelection()}
        onInit={() => void fitView({ padding: 0.16 })}
        proOptions={{ hideAttribution: true }}
      >
        <Background variant={BackgroundVariant.Dots} gap={18} size={1} color="#1c2330" />
        <MiniMap pannable zoomable maskColor="rgba(8,10,16,.72)" />
      </ReactFlow>
    </div>
  );
}
