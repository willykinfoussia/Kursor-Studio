import { Sparkles, Wrench, Server, AlertTriangle } from "lucide-react";
import type { CapabilityTypeFilter } from "../../stores/capabilityStore";

export function CapabilityStats({
  counts,
  attention,
  activeType,
  attentionOnly,
  onSelectType,
  onToggleAttention,
}: {
  counts: { all: number; skill: number; tool: number; mcp: number };
  attention: number;
  activeType: CapabilityTypeFilter;
  attentionOnly: boolean;
  onSelectType: (type: Exclude<CapabilityTypeFilter, "all">) => void;
  onToggleAttention: () => void;
}) {
  return (
    <div className="cap-stats" role="group" aria-label="Capability overview">
      <button
        type="button"
        className={`cap-stat cap-stat-skill ${activeType === "skill" && !attentionOnly ? "active" : ""}`}
        onClick={() => onSelectType("skill")}
        aria-pressed={activeType === "skill" && !attentionOnly}
      >
        <span className="cap-stat-count">{counts.skill}</span>
        <span className="cap-stat-label">
          <Sparkles size={12} strokeWidth={1.8} aria-hidden="true" />
          Skills
        </span>
      </button>
      <button
        type="button"
        className={`cap-stat cap-stat-tool ${activeType === "tool" && !attentionOnly ? "active" : ""}`}
        onClick={() => onSelectType("tool")}
        aria-pressed={activeType === "tool" && !attentionOnly}
      >
        <span className="cap-stat-count">{counts.tool}</span>
        <span className="cap-stat-label">
          <Wrench size={12} strokeWidth={1.8} aria-hidden="true" />
          Tools
        </span>
      </button>
      <button
        type="button"
        className={`cap-stat cap-stat-mcp ${activeType === "mcp" && !attentionOnly ? "active" : ""}`}
        onClick={() => onSelectType("mcp")}
        aria-pressed={activeType === "mcp" && !attentionOnly}
      >
        <span className="cap-stat-count">{counts.mcp}</span>
        <span className="cap-stat-label">
          <Server size={12} strokeWidth={1.8} aria-hidden="true" />
          MCP
        </span>
      </button>
      <button
        type="button"
        className={`cap-stat cap-stat-attention ${attentionOnly ? "active" : ""} ${attention === 0 ? "quiet" : ""}`}
        onClick={onToggleAttention}
        aria-pressed={attentionOnly}
      >
        <span className="cap-stat-count">{attention}</span>
        <span className="cap-stat-label">
          <AlertTriangle size={12} strokeWidth={1.8} aria-hidden="true" />
          Attention
        </span>
      </button>
    </div>
  );
}
