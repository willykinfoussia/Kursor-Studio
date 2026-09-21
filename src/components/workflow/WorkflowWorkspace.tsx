import { useEffect, useRef } from "react";
import { ReactFlowProvider } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useRunGraph } from "../../hooks/useRunGraph";
import { nodeMatchesChatItem, shortRunId } from "../../lib/workflow/GraphSelection";
import { focusStackForNode } from "../../lib/workflow/graphFocus";
import { useProjectStore } from "../../stores/projectStore";
import { useRunStore } from "../../stores/runStore";
import { useWorkflowStore } from "../../stores/workflowStore";
import { WorkflowCapabilitiesUsed } from "./WorkflowCapabilitiesUsed";
import { WorkflowDetails } from "./WorkflowDetails";
import { WorkflowFilters } from "./WorkflowFilters";
import { WorkflowGraph } from "./WorkflowGraph";
import { WorkflowLegend } from "./WorkflowLegend";
import { WorkflowRunList } from "./WorkflowRunList";
import { WorkflowSummary } from "./WorkflowSummary";
import { WorkflowTimeline } from "./WorkflowTimeline";
import { WorkflowToolbar } from "./WorkflowToolbar";

export function WorkflowWorkspace() {
  const projectName = useProjectStore((state) => state.currentProject?.name);
  const recentRuns = useRunStore((state) => state.recentRuns);
  const live = useRunStore((state) => state.live);
  const viewedRunId = useRunStore((state) => state.viewedRunId);
  const refreshRecent = useRunStore((state) => state.refreshRecent);
  const followLive = useRunStore((state) => state.followLive);
  const detailsOpen = useWorkflowStore((state) => state.detailsOpen);
  const setDetailsOpen = useWorkflowStore((state) => state.setDetailsOpen);
  const selectedNodeId = useWorkflowStore((state) => state.selectedNodeId);
  const selectedEdgeId = useWorkflowStore((state) => state.selectedEdgeId);
  const pendingChatItem = useWorkflowStore((state) => state.pendingChatItem);
  const setPendingChatItem = useWorkflowStore((state) => state.setPendingChatItem);
  const selectNode = useWorkflowStore((state) => state.selectNode);
  const setFocusStack = useWorkflowStore((state) => state.setFocusStack);
  const resetFocus = useWorkflowStore((state) => state.resetFocus);
  const { projected, visible, run, canvasMode } = useRunGraph();
  const graphNodes = projected.nodes;
  const nodeIds = graphNodes.map((node) => node.id).join("\0");
  const nodesRef = useRef(graphNodes);
  nodesRef.current = graphNodes;

  useEffect(() => {
    void refreshRecent();
    if (!useRunStore.getState().viewedRunId) followLive();
  }, [followLive, refreshRecent]);

  useEffect(() => {
    resetFocus();
  }, [viewedRunId, resetFocus]);

  useEffect(() => {
    if (!pendingChatItem) return;
    const nodes = nodesRef.current;
    const match = nodes.find((node) => nodeMatchesChatItem(node, pendingChatItem));
    if (!match) return;
    setFocusStack(focusStackForNode(match.id, nodes));
    selectNode(match.id);
    setPendingChatItem(null);
  }, [pendingChatItem, nodeIds, selectNode, setFocusStack, setPendingChatItem]);

  const selectedNode = projected.nodes.find((node) => node.id === selectedNodeId) ?? null;
  const selectedEdge = projected.edges.find((edge) => edge.id === selectedEdgeId) ?? null;
  const inbound = selectedNode
    ? projected.edges.filter((edge) => edge.target === selectedNode.id).flatMap((edge) => {
      const source = projected.nodes.find((node) => node.id === edge.source);
      return source ? [source] : [];
    })
    : [];

  return (
    <div className="wf-workspace">
      <header className="wf-header">
        <div>
          <div className="wf-kicker">{canvasMode === "pipeline" ? "Pipeline" : "Trace"}</div>
          <h1>{run?.id ? `Run #${shortRunId(run.id)}` : "Agent pipeline"}</h1>
        </div>
        <div className="wf-header-meta">
          <span>{projectName ?? "No project"}</span>
          <span>{run?.title ?? (canvasMode === "pipeline" ? "How a turn flows through the harness" : "Current agent run")}</span>
          <span className={`wf-status ${run?.status ?? "pending"}`}>{live ? "● Running" : run?.status ?? "idle"}</span>
          <span>{projected.run.totalSteps || projected.nodes.length} steps</span>
          <span>{projected.run.totalToolCalls} tools</span>
          {run?.model && <span>{run.model}</span>}
        </div>
      </header>
      <div className="wf-body">
        <aside className="wf-sidebar">
          <section className="wf-info">
            <h3>Run info</h3>
            <p>Status {run?.status ?? "idle"}</p>
            <p>Model {run?.model ?? "—"}</p>
            <p>Steps {projected.run.totalSteps || projected.nodes.length}</p>
          </section>
          {canvasMode === "trace" && <WorkflowFilters />}
          <WorkflowLegend />
          <WorkflowSummary run={run} graph={projected} />
          <WorkflowCapabilitiesUsed nodes={projected.nodes} />
          <WorkflowRunList runs={recentRuns} />
        </aside>
        <div className="wf-main">
          <ReactFlowProvider>
            <WorkflowToolbar nodes={visible.nodes} />
            <div className="wf-canvas">
              <WorkflowGraph nodes={visible.nodes} edges={visible.edges} allNodes={projected.nodes} />
            </div>
          </ReactFlowProvider>
          <WorkflowTimeline nodes={projected.nodes.filter((node) => node.timestamp > 0)} startedAt={run?.startedAt} />
        </div>
        {detailsOpen ? (
          <WorkflowDetails node={selectedNode} edge={selectedEdge} inbound={inbound} graphNodes={projected.nodes} />
        ) : (
          <button type="button" className="wf-details-toggle" onClick={() => setDetailsOpen(true)}>Details</button>
        )}
      </div>
    </div>
  );
}
