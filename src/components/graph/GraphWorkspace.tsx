import { useEffect, useRef, useState } from "react";
import { Group, Panel, Separator } from "react-resizable-panels";
import { GRAPH_RELATION_FILTERS, GRAPH_TOOLBAR_FILTERS, useGraphStore } from "../../stores/graphStore";
import { useEditorStore } from "../../stores/editorStore";
import { useProjectStore } from "../../stores/projectStore";
import { EditorWorkspace } from "../editor/EditorWorkspace";
import { GraphCanvas } from "./GraphCanvas";
import { GraphInspector } from "./GraphInspector";
import { SpecExplorer } from "./SpecExplorer";
import type { GraphFilterToken } from "../../lib/graph/filters";

function ResizeHandle({ orientation }: { orientation: "horizontal" | "vertical" }) {
  return <Separator className={`resize-handle ${orientation}`} />;
}

function filterLabel(token: GraphFilterToken): string {
  if (token === "all") return "All";
  if (token === "ui") return "UI";
  return token.slice(0, 1).toUpperCase() + token.slice(1);
}

export function GraphWorkspace() {
  const hydrate = useGraphStore((state) => state.hydrate);
  const rebuild = useGraphStore((state) => state.rebuild);
  const rebuilding = useGraphStore((state) => state.rebuilding);
  const nodes = useGraphStore((state) => state.nodes);
  const status = useGraphStore((state) => state.status);
  const filters = useGraphStore((state) => state.filters);
  const relationFilter = useGraphStore((state) => state.relationFilter);
  const showUncertain = useGraphStore((state) => state.showUncertain);
  const toggleFilter = useGraphStore((state) => state.toggleFilter);
  const setRelationFilter = useGraphStore((state) => state.setRelationFilter);
  const setShowUncertain = useGraphStore((state) => state.setShowUncertain);
  const syncFromEditor = useGraphStore((state) => state.syncFromEditor);
  const revealEditorNonce = useGraphStore((state) => state.revealEditorNonce);
  const activePath = useEditorStore((state) => state.activePath);
  const [showEditor, setShowEditor] = useState(false);
  const [focus, setFocus] = useState<"split" | "editor" | "graph">("split");
  const autoRebuildFor = useRef<string | null>(null);
  const lastReveal = useRef(revealEditorNonce);

  const projectId = useProjectStore((state) => state.currentProject?.id);

  useEffect(() => {
    hydrate();
  }, [hydrate]);

  useEffect(() => {
    if (!projectId || rebuilding || nodes.length > 0) return;
    if (autoRebuildFor.current === projectId) return;
    autoRebuildFor.current = projectId;
    void rebuild();
  }, [projectId, rebuilding, nodes.length, rebuild]);

  useEffect(() => {
    if (activePath) syncFromEditor(activePath);
  }, [activePath, syncFromEditor]);

  useEffect(() => {
    if (revealEditorNonce === lastReveal.current) return;
    lastReveal.current = revealEditorNonce;
    setShowEditor(true);
    setFocus("split");
  }, [revealEditorNonce]);

  const editorSize = focus === "editor" ? "80%" : focus === "graph" ? "20%" : "52%";
  const graphSize = focus === "editor" ? "20%" : focus === "graph" ? "80%" : "48%";

  return (
    <div className="graph-workspace">
      <div className="graph-toolbar">
        <div className="graph-filters">
          {GRAPH_TOOLBAR_FILTERS.map((item) => (
            <button
              type="button"
              key={item}
              className={filters.includes(item) ? "active" : ""}
              onClick={() => toggleFilter(item)}
            >
              {filterLabel(item)}
            </button>
          ))}
        </div>
        <select value={relationFilter} onChange={(event) => setRelationFilter(event.target.value as typeof relationFilter)}>
          {GRAPH_RELATION_FILTERS.map((item) => (
            <option key={item} value={item}>{item === "all" ? "All relations" : item}</option>
          ))}
        </select>
        <label className="graph-uncertain">
          <input type="checkbox" checked={showUncertain} onChange={(event) => setShowUncertain(event.target.checked)} />
          Uncertain
        </label>
        {showEditor && (
          <button type="button" className={focus === "editor" ? "active settings-action" : "settings-action"} onClick={() => setFocus("editor")}>
            Focus Editor
          </button>
        )}
        <button
          type="button"
          className={!showEditor || focus === "graph" ? "active settings-action" : "settings-action"}
          onClick={() => { setShowEditor(false); setFocus("graph"); }}
        >
          Focus Graph
        </button>
        {showEditor && focus !== "split" && (
          <button type="button" className="settings-action" onClick={() => setFocus("split")}>Split</button>
        )}
        <button type="button" className="settings-action" disabled={rebuilding} onClick={() => void rebuild()}>
          {rebuilding ? "Rebuilding…" : "Rebuild"}
        </button>
        {status && <span className="graph-status">{status}</span>}
      </div>
      <Group className="graph-panels" orientation="horizontal">
        <Panel id="graph-tree" defaultSize="20%" minSize="180px" maxSize="32%"><SpecExplorer /></Panel>
        <ResizeHandle orientation="horizontal" />
        <Panel id="graph-center" defaultSize="55%" minSize="320px">
          {showEditor ? (
            <Group key={focus} orientation="vertical">
              <Panel id="graph-editor" defaultSize={editorSize} minSize="140px"><EditorWorkspace /></Panel>
              <ResizeHandle orientation="vertical" />
              <Panel id="graph-canvas" defaultSize={graphSize} minSize="160px"><GraphCanvas /></Panel>
            </Group>
          ) : (
            <GraphCanvas />
          )}
        </Panel>
        <ResizeHandle orientation="horizontal" />
        <Panel id="graph-inspector" defaultSize="25%" minSize="220px" maxSize="36%"><GraphInspector /></Panel>
      </Group>
    </div>
  );
}
