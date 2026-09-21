import { fileName } from "../../lib/filesystem/pathUtils";
import { resolveSpecKind, specScope } from "../../lib/graph/classify";
import { pathFromNodeId } from "../../lib/graph/ids";
import type { FileNode, GraphEdge } from "../../lib/graph/types";
import { useGraphStore } from "../../stores/graphStore";

function evidenceLabel(type: string): string {
  return type.replace(/_/g, " ");
}

function NodeLinks({ title, edges, side }: { title: string; edges: GraphEdge[]; side: "source" | "target" }) {
  const nodes = useGraphStore((state) => state.nodes);
  const selectSpec = useGraphStore((state) => state.selectSpec);
  if (edges.length === 0) return <div className="graph-inspector-empty">{title}: none</div>;
  return (
    <div className="graph-inspector-block">
      <div className="graph-inspector-label">{title} ({edges.length})</div>
      {edges.map((edge) => {
        const otherId = side === "source" ? edge.target : edge.source;
        const path = pathFromNodeId(otherId);
        const node = nodes.find((item) => item.id === otherId);
        return (
          <button
            type="button"
            className="graph-link"
            key={edge.id}
            onClick={() => selectSpec(path)}
          >
            {node ? fileName(node.path) : fileName(path)}
            <span>{edge.relation}</span>
          </button>
        );
      })}
    </div>
  );
}

function NodeInspector({ node, edges }: { node: FileNode; edges: GraphEdge[] }) {
  const outgoing = edges.filter((edge) => edge.source === node.id);
  const incoming = edges.filter((edge) => edge.target === node.id);
  const scope = specScope(node.path);
  const specType = resolveSpecKind(node.path, node.metadata);
  const title = typeof node.metadata.title === "string" && node.metadata.title ? node.metadata.title : fileName(node.path);
  return (
    <>
      <div className="graph-inspector-title">{title}</div>
      <div className="graph-inspector-path">{node.path}</div>
      <div className="graph-inspector-meta">Scope: {scope === "none" ? "project file" : scope}</div>
      <div className="graph-inspector-meta">Type: {scope === "none" ? node.category : specType}</div>
      <div className="graph-inspector-meta">Category: {node.category}</div>
      <div className="graph-inspector-meta">Path: {node.path}</div>
      <NodeLinks title="References" edges={outgoing} side="source" />
      <NodeLinks title="Referenced by" edges={incoming} side="target" />
    </>
  );
}

function EdgeInspector({ edge, nodes }: { edge: GraphEdge; nodes: FileNode[] }) {
  const source = nodes.find((node) => node.id === edge.source);
  const target = nodes.find((node) => node.id === edge.target);
  const selectSpec = useGraphStore((state) => state.selectSpec);
  return (
    <>
      <div className="graph-inspector-title">Relation</div>
      <div className="graph-inspector-value">{edge.relation}</div>
      <div className="graph-inspector-label">Confidence</div>
      <div className="graph-inspector-value">{Math.round(edge.confidence * 100)}%</div>
      <div className="graph-inspector-meta">{pathFromNodeId(edge.source)} → {pathFromNodeId(edge.target)}</div>
      <div className="graph-inspector-label">Evidence</div>
      <ul className="graph-evidence">
        {edge.evidence.map((item) => (
          <li key={`${item.type}:${item.details ?? ""}`}>
            <span>✓</span>
            <span>
              <strong>{evidenceLabel(item.type)}</strong>
              {item.details ? ` — ${item.details}` : ""}
            </span>
          </li>
        ))}
      </ul>
      <div className="graph-inspector-meta">Analyzer: Deterministic</div>
      <div className="graph-inspector-meta">
        <button type="button" className="graph-link" onClick={() => source && selectSpec(source.path)}>
          {source ? fileName(source.path) : pathFromNodeId(edge.source)}
        </button>
        <button type="button" className="graph-link" onClick={() => target && selectSpec(target.path)}>
          {target ? fileName(target.path) : pathFromNodeId(edge.target)}
        </button>
      </div>
    </>
  );
}

export function GraphInspector() {
  const nodes = useGraphStore((state) => state.nodes);
  const edges = useGraphStore((state) => state.edges);
  const selectedNodeId = useGraphStore((state) => state.selectedNodeId);
  const selectedEdgeId = useGraphStore((state) => state.selectedEdgeId);
  const node = nodes.find((item) => item.id === selectedNodeId);
  const edge = edges.find((item) => item.id === selectedEdgeId);

  return (
    <aside className="graph-inspector">
      <div className="section-header"><span>INSPECTOR</span></div>
      <div className="graph-inspector-body">
        {edge ? <EdgeInspector edge={edge} nodes={nodes} /> : node ? <NodeInspector node={node} edges={edges} /> : (
          <div className="graph-inspector-empty">Select a file or a relation.</div>
        )}
      </div>
    </aside>
  );
}
