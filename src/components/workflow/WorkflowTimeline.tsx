import type { AgentGraphNode } from "../../lib/workflow/types";
import { useWorkflowStore } from "../../stores/workflowStore";

export function WorkflowTimeline({
  nodes,
  startedAt,
}: {
  nodes: AgentGraphNode[];
  startedAt?: number;
}) {
  const selectedNodeId = useWorkflowStore((state) => state.selectedNodeId);
  const selectNode = useWorkflowStore((state) => state.selectNode);
  const origin = startedAt ?? nodes[0]?.timestamp ?? 0;
  const items = [...nodes].sort((a, b) => a.timestamp - b.timestamp);

  return (
    <ol className="wf-timeline" aria-label="Run timeline">
      {items.map((node) => {
        const elapsed = Math.max(0, node.timestamp - origin);
        return (
          <li key={node.id}>
            <button
              type="button"
              className={node.id === selectedNodeId ? "active" : ""}
              onClick={() => selectNode(node.id)}
            >
              <span className="wf-time">{formatOffset(elapsed)}</span>
              <span>{node.label}</span>
            </button>
          </li>
        );
      })}
    </ol>
  );
}

function formatOffset(ms: number) {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(rest).padStart(2, "0")}`;
}
