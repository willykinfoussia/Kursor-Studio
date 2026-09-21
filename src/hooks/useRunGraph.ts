import { useMemo, useRef } from "react";
import { applyGraphFilters } from "../lib/workflow/GraphFilters";
import { focusedGraph } from "../lib/workflow/graphFocus";
import { bindPipeline } from "../lib/workflow/PipelineBinder";
import { projectRunIncremental, RunGraphProjector } from "../lib/workflow/RunGraphProjector";
import { useRunStore } from "../stores/runStore";
import { useWorkflowStore } from "../stores/workflowStore";

export function useRunGraph() {
  const events = useRunStore((state) => state.events);
  const activeRun = useRunStore((state) => state.activeRun);
  const filters = useWorkflowStore((state) => state.filters);
  const collapsedGroups = useWorkflowStore((state) => state.collapsedGroups);
  const canvasMode = useWorkflowStore((state) => state.canvasMode);
  const focusStack = useWorkflowStore((state) => state.focusStack);
  const cacheRef = useRef<{ projector: RunGraphProjector; sequence: number; runId: string } | undefined>(undefined);

  const lastSeq = events.at(-1)?.sequence ?? 0;
  const runId = events[0]?.runId ?? activeRun?.id ?? "";

  const trace = useMemo(() => {
    const result = projectRunIncremental(events, cacheRef.current);
    cacheRef.current = {
      projector: result.projector,
      sequence: result.graph.lastSequence,
      runId: events[0]?.runId ?? result.graph.run.id,
    };
    return result.graph;
  }, [events, lastSeq, runId]);

  const pipeline = useMemo(() => bindPipeline(events, activeRun), [events, lastSeq, runId, activeRun]);

  const projected = canvasMode === "pipeline" ? pipeline : trace;
  const collapsed = useMemo(
    () => new Set(Object.entries(collapsedGroups).filter(([, collapsed]) => collapsed).map(([id]) => id)),
    [collapsedGroups],
  );
  const visible = useMemo(() => {
    if (canvasMode === "pipeline") return focusedGraph(projected.nodes, projected.edges, focusStack);
    return applyGraphFilters(projected, filters, collapsed);
  }, [canvasMode, projected, filters, collapsed, focusStack]);

  const run = projected.run.id ? projected.run : activeRun;

  return { projected, visible, run, canvasMode };
}
