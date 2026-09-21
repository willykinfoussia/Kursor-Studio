import { ChevronRight, Maximize, Pause, Play, RotateCcw, Search, ZoomIn, ZoomOut } from "lucide-react";
import { useReactFlow } from "@xyflow/react";
import { searchGraphNodes } from "../../lib/workflow/GraphSearch";
import type { AgentGraphNode, GraphLayoutName } from "../../lib/workflow/types";
import { useWorkflowStore } from "../../stores/workflowStore";
import { useRunStore } from "../../stores/runStore";

export function WorkflowToolbar({ nodes }: { nodes: AgentGraphNode[] }) {
  const { zoomIn, zoomOut, fitView, setViewport } = useReactFlow();
  const canvasMode = useWorkflowStore((state) => state.canvasMode);
  const setCanvasMode = useWorkflowStore((state) => state.setCanvasMode);
  const layout = useWorkflowStore((state) => state.layout);
  const setLayout = useWorkflowStore((state) => state.setLayout);
  const followAgent = useWorkflowStore((state) => state.followAgent);
  const setFollowAgent = useWorkflowStore((state) => state.setFollowAgent);
  const livePaused = useWorkflowStore((state) => state.livePaused);
  const setLivePaused = useWorkflowStore((state) => state.setLivePaused);
  const searchQuery = useWorkflowStore((state) => state.searchQuery);
  const setSearchQuery = useWorkflowStore((state) => state.setSearchQuery);
  const selectNode = useWorkflowStore((state) => state.selectNode);
  const focusStack = useWorkflowStore((state) => state.focusStack);
  const resetFocus = useWorkflowStore((state) => state.resetFocus);
  const setFocusStack = useWorkflowStore((state) => state.setFocusStack);
  const live = useRunStore((state) => state.live);
  const followLive = useRunStore((state) => state.followLive);
  const hits = searchGraphNodes(nodes, searchQuery);

  return (
    <div className="wf-toolbar">
      <button type="button" onClick={() => void zoomIn()} aria-label="Zoom in"><ZoomIn size={14} /></button>
      <button type="button" onClick={() => void zoomOut()} aria-label="Zoom out"><ZoomOut size={14} /></button>
      <button type="button" onClick={() => void fitView({ padding: 0.16 })} aria-label="Fit"><Maximize size={14} /> Fit</button>
      <button type="button" onClick={() => { void setViewport({ x: 40, y: 40, zoom: 1 }); setFollowAgent(true); }} aria-label="Reset"><RotateCcw size={14} /> Reset</button>
      <button
        type="button"
        className={canvasMode === "pipeline" ? "active" : ""}
        onClick={() => { setCanvasMode("pipeline"); void fitView({ padding: 0.16 }); }}
      >
        Pipeline
      </button>
      <button
        type="button"
        className={canvasMode === "trace" ? "active" : ""}
        onClick={() => { setCanvasMode("trace"); void fitView({ padding: 0.16 }); }}
      >
        Trace
      </button>
      {canvasMode === "pipeline" && (
        <nav className="wf-breadcrumb" aria-label="Pipeline level">
          <button type="button" className={focusStack.length === 0 ? "active" : ""} onClick={() => resetFocus()}>
            Pipeline
          </button>
          {focusStack.map((focus, index) => (
            <span key={`${focus.id}:${index}`} className="wf-breadcrumb-item">
              <ChevronRight size={12} className="wf-breadcrumb-sep" />
              <button
                type="button"
                className={index === focusStack.length - 1 ? "active" : ""}
                onClick={() => setFocusStack(focusStack.slice(0, index + 1))}
              >
                {focus.label}
              </button>
            </span>
          ))}
        </nav>
      )}
      {canvasMode === "trace" && (
      <select value={layout} onChange={(event) => setLayout(event.target.value as GraphLayoutName)} aria-label="Layout">
        <option value="dag">DAG</option>
        <option value="tree" disabled>Tree</option>
        <option value="radial" disabled>Radial</option>
      </select>
      )}
      <span className={`wf-live${live && !livePaused ? " on" : ""}`}>{live ? "LIVE" : "RECORDED"}</span>
      <button type="button" onClick={() => {
        if (livePaused) {
          setLivePaused(false);
          followLive();
        } else {
          setLivePaused(true);
        }
      }}>
        {livePaused ? <Play size={13} /> : <Pause size={13} />} {livePaused ? "Resume" : "Pause"}
      </button>
      {!followAgent && (
        <button type="button" className="active" onClick={() => setFollowAgent(true)}>Follow Agent</button>
      )}
      <label className="wf-search">
        <Search size={13} />
        <input
          value={searchQuery}
          onChange={(event) => setSearchQuery(event.target.value)}
          placeholder={canvasMode === "pipeline" ? "Search pipeline…" : "Search run…"}
          aria-label="Search run"
        />
      </label>
      {hits.length > 0 && searchQuery.trim() && (
        <div className="wf-search-hits">
          {hits.slice(0, 8).map((hit) => (
            <button type="button" key={hit.nodeId} onClick={() => selectNode(hit.nodeId)}>
              {hit.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
