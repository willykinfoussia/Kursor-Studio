import { useRef } from "react";
import type { CapabilityTypeFilter } from "../../stores/capabilityStore";

export function CapabilityTabs({
  active,
  counts,
  onChange,
}: {
  active: CapabilityTypeFilter;
  counts: { all: number; skill: number; tool: number; mcp: number };
  onChange: (value: CapabilityTypeFilter) => void;
}) {
  const tabs: { id: CapabilityTypeFilter; label: string; count: number }[] = [
    { id: "all", label: "All", count: counts.all },
    { id: "skill", label: "Skills", count: counts.skill },
    { id: "tool", label: "Tools", count: counts.tool },
    { id: "mcp", label: "MCP", count: counts.mcp },
  ];
  const listRef = useRef<HTMLDivElement>(null);

  const move = (delta: number) => {
    const index = tabs.findIndex((tab) => tab.id === active);
    const next = tabs[(index + delta + tabs.length) % tabs.length];
    if (next) onChange(next.id);
  };

  return (
    <div
      className="cap-tabs"
      role="tablist"
      aria-label="Capability types"
      ref={listRef}
      onKeyDown={(event) => {
        if (event.key === "ArrowRight") {
          event.preventDefault();
          move(1);
        }
        if (event.key === "ArrowLeft") {
          event.preventDefault();
          move(-1);
        }
        if (event.key === "Home") {
          event.preventDefault();
          onChange("all");
        }
        if (event.key === "End") {
          event.preventDefault();
          onChange("mcp");
        }
      }}
    >
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          role="tab"
          id={`cap-tab-${tab.id}`}
          aria-selected={active === tab.id}
          tabIndex={active === tab.id ? 0 : -1}
          className={active === tab.id ? `active cap-tab-${tab.id}` : `cap-tab-${tab.id}`}
          onClick={() => onChange(tab.id)}
        >
          {tab.label}
          <span className="cap-tab-count">{tab.count}</span>
        </button>
      ))}
    </div>
  );
}
