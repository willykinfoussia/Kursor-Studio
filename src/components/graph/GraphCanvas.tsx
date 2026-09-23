import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { fileName } from "../../lib/filesystem/pathUtils";
import { edgeMatchesFilters, nodeMatchesFilters } from "../../lib/graph/filters";
import {
  GRAPH_WORLD_HEIGHT,
  GRAPH_WORLD_WIDTH,
  bezierPath,
  nodeColorKind,
  nodeHaloRadius,
  nodeLabelOffset,
  nodeLabelSize,
  nodeLinkWeight,
  nodeMarkOpacity,
  nodeRadius,
  nodeStrokeWidth,
  seedPosition,
  weightedEdgeOpacity,
  weightedEdgeStrokeWidth,
} from "../../lib/graph/layout";
import type { FileNode } from "../../lib/graph/types";
import { useGraphStore } from "../../stores/graphStore";

interface SimNode {
  id: string;
  path: string;
  node: FileNode;
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  pinned: boolean;
}

interface ViewTransform {
  x: number;
  y: number;
  k: number;
}

const CHARGE = 2200;
const SPRING = 0.018;
const REST = 150;
const NODE_GAP = 18;
const DAMPING = 0.86;
const CENTER = 0.0018;
const ZOOM_MIN = 0.15;
const ZOOM_MAX = 4;
const ZOOM_STEP = 1.18;
const FIT_PADDING = 48;

function clampZoom(value: number): number {
  return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, value));
}

function neighborsOf(id: string, edges: { source: string; target: string }[]): Set<string> {
  const next = new Set<string>([id]);
  for (const edge of edges) {
    if (edge.source === id) next.add(edge.target);
    if (edge.target === id) next.add(edge.source);
  }
  return next;
}

function fitTransform(items: Iterable<{ x: number; y: number; radius: number; path: string }>, width: number, height: number): ViewTransform {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const item of items) {
    const labelWidth = Math.min(fileName(item.path).length * nodeLabelSize(item.radius) * 0.62, 220);
    const pad = item.radius + 8;
    minX = Math.min(minX, item.x - pad);
    minY = Math.min(minY, item.y - pad);
    maxX = Math.max(maxX, item.x + pad + labelWidth);
    maxY = Math.max(maxY, item.y + pad);
  }
  if (!Number.isFinite(minX) || width < 8 || height < 8) return { x: 40, y: 20, k: 1 };
  const worldWidth = Math.max(maxX - minX, 80);
  const worldHeight = Math.max(maxY - minY, 80);
  const k = clampZoom(Math.min((width - FIT_PADDING * 2) / worldWidth, (height - FIT_PADDING * 2) / worldHeight));
  return {
    k,
    x: (width - worldWidth * k) / 2 - minX * k,
    y: (height - worldHeight * k) / 2 - minY * k,
  };
}

export function GraphCanvas() {
  const nodes = useGraphStore((state) => state.nodes);
  const edges = useGraphStore((state) => state.edges);
  const filters = useGraphStore((state) => state.filters);
  const relationFilter = useGraphStore((state) => state.relationFilter);
  const showUncertain = useGraphStore((state) => state.showUncertain);
  const selectedNodeId = useGraphStore((state) => state.selectedNodeId);
  const selectedEdgeId = useGraphStore((state) => state.selectedEdgeId);
  const centerRequest = useGraphStore((state) => state.centerRequest);
  const centerNonce = useGraphStore((state) => state.centerNonce);
  const selectSpec = useGraphStore((state) => state.selectSpec);
  const selectEdge = useGraphStore((state) => state.selectEdge);
  const clearCenterRequest = useGraphStore((state) => state.clearCenterRequest);
  const clearTypeFilters = useGraphStore((state) => state.clearTypeFilters);

  const visibleNodes = useMemo(
    () => nodes.filter((node) => nodeMatchesFilters(node, filters)),
    [nodes, filters],
  );
  const visibleIds = useMemo(() => new Set(visibleNodes.map((node) => node.id)), [visibleNodes]);
  const visibleEdges = useMemo(
    () => edges.filter((edge) => edgeMatchesFilters(edge, visibleIds, relationFilter, showUncertain)),
    [edges, visibleIds, relationFilter, showUncertain],
  );
  const radiusById = useMemo(() => {
    const degree = new Map<string, number>();
    for (const node of visibleNodes) degree.set(node.id, 0);
    for (const edge of visibleEdges) {
      degree.set(edge.source, (degree.get(edge.source) ?? 0) + 1);
      degree.set(edge.target, (degree.get(edge.target) ?? 0) + 1);
    }
    const radii = new Map<string, number>();
    for (const [id, links] of degree) radii.set(id, nodeRadius(links));
    return radii;
  }, [visibleNodes, visibleEdges]);

  const sim = useRef(new Map<string, SimNode>());
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const dragId = useRef<string | null>(null);
  const pan = useRef<{ x: number; y: number; pointerX: number; pointerY: number } | null>(null);
  const viewRef = useRef<ViewTransform>({ x: 40, y: 20, k: 1 });
  const fitted = useRef(false);
  const [view, setView] = useState<ViewTransform>({ x: 40, y: 20, k: 1 });
  const [hoverId, setHoverId] = useState<string | null>(null);
  const [, setFrame] = useState(0);

  const applyView = useCallback((next: ViewTransform | ((current: ViewTransform) => ViewTransform)) => {
    setView((current) => {
      const resolved = typeof next === "function" ? next(current) : next;
      viewRef.current = resolved;
      return resolved;
    });
  }, []);

  useEffect(() => {
    const current = sim.current;
    const seen = new Set<string>();
    for (const node of visibleNodes) {
      seen.add(node.id);
      const existing = current.get(node.id);
      if (existing) {
        existing.node = node;
        existing.path = node.path;
        existing.radius = radiusById.get(node.id) ?? existing.radius;
        continue;
      }
      const seed = seedPosition(node.id);
      current.set(node.id, {
        id: node.id,
        path: node.path,
        node,
        x: seed.x,
        y: seed.y,
        vx: 0,
        vy: 0,
        radius: radiusById.get(node.id) ?? nodeRadius(0),
        pinned: false,
      });
    }
    for (const id of [...current.keys()]) {
      if (!seen.has(id)) current.delete(id);
    }
    setFrame((value) => value + 1);
  }, [visibleNodes, radiusById]);

  const fitAll = useCallback(() => {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return;
    applyView(fitTransform(sim.current.values(), rect.width, rect.height));
  }, [applyView]);

  useEffect(() => {
    if (visibleNodes.length === 0) {
      fitted.current = false;
      return;
    }
    if (fitted.current) return;
    fitted.current = true;
    const frame = requestAnimationFrame(() => fitAll());
    const timer = window.setTimeout(fitAll, 420);
    return () => {
      cancelAnimationFrame(frame);
      window.clearTimeout(timer);
    };
  }, [visibleNodes, fitAll]);

  useEffect(() => {
    let frame = 0;
    let ticks = 0;
    const step = () => {
      const items = [...sim.current.values()];
      const byId = sim.current;
      for (const item of items) item.radius = radiusById.get(item.id) ?? nodeRadius(0);
      for (let i = 0; i < items.length; i += 1) {
        for (let j = i + 1; j < items.length; j += 1) {
          const left = items[i];
          const right = items[j];
          if (!left || !right) continue;
          const dx = left.x - right.x;
          const dy = left.y - right.y;
          const dist = Math.hypot(dx, dy) || 0.01;
          const scale = 1 + 0.45 * (nodeLinkWeight(left.radius) + nodeLinkWeight(right.radius));
          const force = (CHARGE * scale) / (dist * dist);
          const fx = (dx / dist) * force;
          const fy = (dy / dist) * force;
          if (!left.pinned) {
            left.vx += fx;
            left.vy += fy;
          }
          if (!right.pinned) {
            right.vx -= fx;
            right.vy -= fy;
          }
          const minDist = left.radius + right.radius + NODE_GAP;
          if (dist < minDist) {
            const push = (minDist - dist) * 0.35;
            const ux = dx / dist;
            const uy = dy / dist;
            if (!left.pinned) {
              left.vx += ux * push;
              left.vy += uy * push;
            }
            if (!right.pinned) {
              right.vx -= ux * push;
              right.vy -= uy * push;
            }
          }
        }
      }
      for (const edge of visibleEdges) {
        const from = byId.get(edge.source);
        const to = byId.get(edge.target);
        if (!from || !to) continue;
        const dx = to.x - from.x;
        const dy = to.y - from.y;
        const dist = Math.hypot(dx, dy) || 0.01;
        const rest = REST + from.radius + to.radius;
        const delta = (dist - rest) * SPRING;
        const fx = (dx / dist) * delta;
        const fy = (dy / dist) * delta;
        if (!from.pinned) {
          from.vx += fx;
          from.vy += fy;
        }
        if (!to.pinned) {
          to.vx -= fx;
          to.vy -= fy;
        }
      }
      let energy = 0;
      for (const item of items) {
        if (!item.pinned) {
          item.vx += (GRAPH_WORLD_WIDTH / 2 - item.x) * CENTER;
          item.vy += (GRAPH_WORLD_HEIGHT / 2 - item.y) * CENTER;
          item.vx *= DAMPING;
          item.vy *= DAMPING;
          item.x += item.vx;
          item.y += item.vy;
          const margin = Math.max(48, item.radius + 16);
          item.x = Math.max(margin, Math.min(GRAPH_WORLD_WIDTH - margin, item.x));
          item.y = Math.max(margin, Math.min(GRAPH_WORLD_HEIGHT - margin, item.y));
        }
        energy += item.vx * item.vx + item.vy * item.vy;
      }
      ticks += 1;
      setFrame((value) => value + 1);
      if (energy > 0.08 && ticks < 420) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [visibleNodes, visibleEdges, radiusById]);

  const placed = [...sim.current.values()];
  const focusId = hoverId ?? selectedNodeId;
  const focusNeighbors = useMemo(
    () => (focusId ? neighborsOf(focusId, visibleEdges) : null),
    [focusId, visibleEdges],
  );

  const zoomAt = useCallback((factor: number, clientX?: number, clientY?: number) => {
    const rect = canvasRef.current?.getBoundingClientRect() ?? svgRef.current?.getBoundingClientRect();
    if (!rect) return;
    const cx = clientX ?? rect.left + rect.width / 2;
    const cy = clientY ?? rect.top + rect.height / 2;
    applyView((current) => {
      const worldX = (cx - rect.left - current.x) / current.k;
      const worldY = (cy - rect.top - current.y) / current.k;
      const k = clampZoom(current.k * factor);
      return {
        k,
        x: cx - rect.left - worldX * k,
        y: cy - rect.top - worldY * k,
      };
    });
  }, [applyView]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const sensitivity = event.deltaMode === 1 ? 0.05 : 0.002;
      zoomAt(2 ** (-event.deltaY * sensitivity), event.clientX, event.clientY);
    };
    canvas.addEventListener("wheel", onWheel, { passive: false });
    return () => canvas.removeEventListener("wheel", onWheel);
  }, [zoomAt]);

  const worldFromPointer = useCallback((clientX: number, clientY: number) => {
    const rect = svgRef.current?.getBoundingClientRect();
    const current = viewRef.current;
    if (!rect) return { x: 0, y: 0 };
    return {
      x: (clientX - rect.left - current.x) / current.k,
      y: (clientY - rect.top - current.y) / current.k,
    };
  }, []);

  useEffect(() => {
    if (!centerRequest) return;
    const node = sim.current.get(centerRequest);
    const rect = svgRef.current?.getBoundingClientRect();
    if (!node || !rect) return;
    applyView((current) => ({
      ...current,
      x: rect.width / 2 - node.x * current.k,
      y: rect.height / 2 - node.y * current.k,
    }));
    clearCenterRequest();
  }, [centerRequest, centerNonce, clearCenterRequest, applyView]);

  const resetFilters = () => {
    clearTypeFilters();
    requestAnimationFrame(() => {
      fitted.current = true;
      fitAll();
    });
  };

  const centerView = () => {
    if (selectedNodeId) {
      useGraphStore.getState().selectNode(selectedNodeId);
      return;
    }
    fitAll();
  };

  return (
    <div className="graph-canvas" ref={canvasRef}>
      <div className="graph-canvas-tools">
        <button type="button" onClick={() => zoomAt(1 / ZOOM_STEP)} title="Zoom out">−</button>
        <button type="button" onClick={() => zoomAt(ZOOM_STEP)} title="Zoom in">+</button>
        <button type="button" onClick={resetFilters} title="Clear type filters">Reset</button>
        <button type="button" onClick={centerView} title="Center">Center</button>
      </div>
      <svg
        ref={svgRef}
        width="100%"
        height="100%"
        role="img"
        aria-label="Knowledge graph"
        onPointerDown={(event) => {
          const target = event.target as Element;
          if (target !== event.currentTarget && target.tagName !== "svg" && target.getAttribute("data-graph-pan") !== "true") return;
          const current = viewRef.current;
          pan.current = { x: current.x, y: current.y, pointerX: event.clientX, pointerY: event.clientY };
        }}
        onPointerMove={(event) => {
          if (dragId.current) {
            const world = worldFromPointer(event.clientX, event.clientY);
            const item = sim.current.get(dragId.current);
            if (item) {
              item.x = world.x;
              item.y = world.y;
              item.vx = 0;
              item.vy = 0;
              setFrame((value) => value + 1);
            }
            return;
          }
          if (!pan.current) return;
          applyView({
            k: viewRef.current.k,
            x: pan.current.x + (event.clientX - pan.current.pointerX),
            y: pan.current.y + (event.clientY - pan.current.pointerY),
          });
        }}
        onPointerUp={() => {
          if (dragId.current) {
            const item = sim.current.get(dragId.current);
            if (item) item.pinned = false;
          }
          dragId.current = null;
          pan.current = null;
        }}
        onPointerLeave={() => {
          dragId.current = null;
          pan.current = null;
        }}
      >
        <rect width="100%" height="100%" fill="transparent" data-graph-pan="true" />
        <g transform={`translate(${view.x} ${view.y}) scale(${view.k})`}>
          {visibleEdges.map((edge) => {
            const from = sim.current.get(edge.source);
            const to = sim.current.get(edge.target);
            if (!from || !to) return null;
            const selected = edge.id === selectedEdgeId;
            const dimmed = Boolean(focusNeighbors && !focusNeighbors.has(edge.source) && !focusNeighbors.has(edge.target));
            const sourceRadius = from.radius;
            const targetRadius = to.radius;
            return (
              <g
                key={edge.id}
                className={`graph-edge ${selected ? "selected" : ""} ${dimmed ? "dimmed" : ""}`}
                onClick={(event) => {
                  event.stopPropagation();
                  selectEdge(edge.id);
                }}
              >
                <path
                  d={bezierPath(from.x, from.y, to.x, to.y)}
                  fill="none"
                  strokeWidth={weightedEdgeStrokeWidth(edge.confidence, sourceRadius, targetRadius)}
                  strokeOpacity={weightedEdgeOpacity(edge.confidence, sourceRadius, targetRadius)}
                />
              </g>
            );
          })}
          {placed.map((item) => {
            const selected = item.id === selectedNodeId;
            const dimmed = Boolean(focusNeighbors && !focusNeighbors.has(item.id));
            const kind = nodeColorKind(item.node);
            const radius = radiusById.get(item.id) ?? item.radius;
            const labelSize = nodeLabelSize(radius);
            return (
              <g
                key={item.id}
                className={`graph-node kind-${kind} ${selected ? "selected" : ""} ${dimmed ? "dimmed" : ""}`}
                transform={`translate(${item.x}, ${item.y})`}
                onPointerDown={(event) => {
                  event.stopPropagation();
                  dragId.current = item.id;
                  item.pinned = true;
                }}
                onClick={(event) => {
                  event.stopPropagation();
                  selectSpec(item.path, { center: false });
                }}
                onPointerEnter={() => setHoverId(item.id)}
                onPointerLeave={() => setHoverId((current) => current === item.id ? null : current)}
              >
                {selected && <circle className="graph-node-halo" r={nodeHaloRadius(radius)} />}
                <circle
                  r={radius}
                  strokeWidth={nodeStrokeWidth(radius, selected)}
                  opacity={nodeMarkOpacity(radius)}
                />
                <text x={nodeLabelOffset(radius)} y={labelSize * 0.35} style={{ fontSize: labelSize }}>{fileName(item.path)}</text>
                <title>{item.path}</title>
              </g>
            );
          })}
        </g>
      </svg>
    </div>
  );
}
