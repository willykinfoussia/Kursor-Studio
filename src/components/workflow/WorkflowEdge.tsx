import { BaseEdge, getBezierPath, type Edge, type EdgeProps } from "@xyflow/react";
import type { AgentGraphEdge } from "../../lib/workflow/types";

export type WorkflowRfEdge = Edge<{ edge: AgentGraphEdge }>;

const LOOP_OFFSET = 48;
const LOOP_RADIUS = 14;

function loopUnderPath(sourceX: number, sourceY: number, targetX: number, targetY: number) {
  const bottom = Math.max(sourceY, targetY) + LOOP_OFFSET;
  const dir = targetX < sourceX ? -1 : 1;
  const span = Math.abs(targetX - sourceX);
  const radius = Math.min(LOOP_RADIUS, span / 2);
  return [
    `M ${sourceX} ${sourceY}`,
    `L ${sourceX} ${bottom - radius}`,
    `Q ${sourceX} ${bottom} ${sourceX + dir * radius} ${bottom}`,
    `L ${targetX - dir * radius} ${bottom}`,
    `Q ${targetX} ${bottom} ${targetX} ${bottom - radius}`,
    `L ${targetX} ${targetY}`,
  ].join(" ");
}

function contextOverPath(sourceX: number, sourceY: number, targetX: number, targetY: number) {
  const top = Math.min(sourceY, targetY) - LOOP_OFFSET;
  const dir = targetX < sourceX ? -1 : 1;
  const span = Math.abs(targetX - sourceX);
  const radius = Math.min(LOOP_RADIUS, span / 2);
  return [
    `M ${sourceX} ${sourceY}`,
    `L ${sourceX} ${top + radius}`,
    `Q ${sourceX} ${top} ${sourceX + dir * radius} ${top}`,
    `L ${targetX - dir * radius} ${top}`,
    `Q ${targetX} ${top} ${targetX} ${top + radius}`,
    `L ${targetX} ${targetY}`,
  ].join(" ");
}

export function WorkflowEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  data,
  selected,
}: EdgeProps<WorkflowRfEdge>) {
  const type = data?.edge.type ?? "sequence";
  const backward = sourceX > targetX + 8;
  const path = type === "context"
    ? contextOverPath(sourceX, sourceY, targetX, targetY)
    : type === "loop" || backward
      ? loopUnderPath(sourceX, sourceY, targetX, targetY)
      : getBezierPath({ sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition })[0];
  return (
    <BaseEdge
      id={id}
      path={path}
      className={`wf-edge type-${type}${selected ? " selected" : ""}`}
    />
  );
}

export const workflowEdgeTypes = {
  workflow: WorkflowEdge,
};
