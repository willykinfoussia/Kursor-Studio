import { clamp01 } from "./config";
import { resolveSpecKind, specScope } from "./classify";
import type { FileNode } from "./types";

export const GRAPH_WORLD_WIDTH = 1600;
export const GRAPH_WORLD_HEIGHT = 1100;

export function hashNodeId(id: string): number {
  let hash = 2166136261;
  for (let index = 0; index < id.length; index += 1) {
    hash ^= id.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function seedPosition(
  id: string,
  width = GRAPH_WORLD_WIDTH,
  height = GRAPH_WORLD_HEIGHT,
): { x: number; y: number } {
  const hash = hashNodeId(id);
  const x = 80 + ((hash % 1000) / 1000) * (width - 160);
  const y = 80 + ((((hash >>> 10) % 1000) / 1000) * (height - 160));
  return { x, y };
}

export function edgeStrokeWidth(confidence: number): number {
  return 0.7 + clamp01(confidence) * 3;
}

export function edgeOpacity(confidence: number): number {
  return 0.22 + clamp01(confidence) * 0.68;
}

export type GraphNodeKindColor =
  | "account"
  | "project"
  | "functional"
  | "business"
  | "ui"
  | "technical"
  | "constraints"
  | "code"
  | "data"
  | "tests"
  | "docs"
  | "preference"
  | "generic";

export function nodeColorKind(node: FileNode): GraphNodeKindColor {
  const scope = specScope(node.path);
  if (scope === "account") return "account";
  const specType = resolveSpecKind(node.path, node.metadata);
  if (specType === "functional" || specType === "business" || specType === "ui" || specType === "technical" || specType === "constraints") {
    return specType;
  }
  if (scope === "project") return "project";
  if (node.category === "code") return "code";
  if (node.category === "data") return "data";
  if (node.category === "tests") return "tests";
  if (node.category === "documentation") return "docs";
  if (specType === "preference") return "preference";
  return "generic";
}

export function bezierControl(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  curve = 28,
): { cx: number; cy: number } {
  const mx = (x1 + x2) / 2;
  const my = (y1 + y2) / 2;
  const dx = x2 - x1;
  const dy = y2 - y1;
  const length = Math.hypot(dx, dy) || 1;
  return {
    cx: mx + (-dy / length) * curve,
    cy: my + (dx / length) * curve,
  };
}

export function bezierPath(x1: number, y1: number, x2: number, y2: number): string {
  const { cx, cy } = bezierControl(x1, y1, x2, y2);
  return `M ${x1} ${y1} Q ${cx} ${cy} ${x2} ${y2}`;
}
