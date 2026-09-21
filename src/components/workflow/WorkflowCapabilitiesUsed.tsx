import { useMemo, useState } from "react";
import { capabilitiesUsedInGraph } from "../../lib/capabilities/usedInGraph";
import { openCapabilities, openCapability } from "../../lib/workflow/navigation";
import type { AgentGraphNode } from "../../lib/workflow/types";
import { useWorkflowStore } from "../../stores/workflowStore";

export function WorkflowCapabilitiesUsed({ nodes }: { nodes: AgentGraphNode[] }) {
  const grouped = useMemo(() => capabilitiesUsedInGraph(nodes), [nodes]);
  const highlighted = useWorkflowStore((state) => state.highlightedCapabilityId);
  const setHighlighted = useWorkflowStore((state) => state.setHighlightedCapabilityId);
  const [open, setOpen] = useState({ skills: true, tools: false, mcp: false });
  const total = grouped.all.reduce((sum, item) => sum + item.count, 0);
  if (total === 0) {
    return (
      <section className="wf-capabilities">
        <h3>Capabilities used</h3>
        <p className="wf-muted">None observed in this run.</p>
      </section>
    );
  }

  const section = (
    key: "skills" | "tools" | "mcp",
    label: string,
    items: typeof grouped.skills,
  ) => {
    const calls = items.reduce((sum, item) => sum + item.count, 0);
    if (items.length === 0) return null;
    return (
      <div>
        <button type="button" className="cap-used-toggle" onClick={() => setOpen((state) => ({ ...state, [key]: !state[key] }))}>
          {label} · {calls} {key === "skills" ? "activations" : "calls"} · {items.length}
        </button>
        {open[key] && (
          <ul>
            {items.map((item) => (
              <li key={item.capabilityId}>
                <button
                  type="button"
                  className={highlighted === item.capabilityId ? "active" : ""}
                  onClick={() => setHighlighted(highlighted === item.capabilityId ? null : item.capabilityId)}
                >
                  {item.name} ×{item.count}
                </button>
                <button type="button" className="cap-link" onClick={() => openCapability(item.capabilityId)}>View</button>
              </li>
            ))}
          </ul>
        )}
      </div>
    );
  };

  return (
    <section className="wf-capabilities">
      <h3>Capabilities used</h3>
      {section("skills", "Skills", grouped.skills)}
      {section("tools", "Tools", grouped.tools)}
      {section("mcp", "MCP", grouped.mcp)}
      {highlighted && (
        <p className="wf-muted">
          {grouped.all.find((item) => item.capabilityId === highlighted)?.count ?? 0} usages in this run
        </p>
      )}
      <button type="button" className="cap-link" onClick={() => openCapabilities()}>
        View all in Capabilities
      </button>
    </section>
  );
}
