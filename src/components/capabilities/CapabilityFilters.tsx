import { useEffect, useRef, useState } from "react";
import { Filter, X } from "lucide-react";
import { BUILTIN_AGENTS } from "../../lib/agent/agents/builtin";
import { hasCapabilityFilters, useCapabilityStore } from "../../stores/capabilityStore";
import { SelectControl } from "../ui/Controls";

const SOURCES = ["builtin", "project", "user", "mcp"] as const;
const STATUSES = ["enabled", "disabled", "error", "unavailable"] as const;
const RISKS = ["low", "medium", "high", "critical"] as const;

function chipLabel(value: string) {
  if (value === "builtin") return "Built-in";
  if (value === "mcp") return "MCP";
  return value[0]!.toUpperCase() + value.slice(1);
}

export function CapabilityFilters() {
  const sourceFilter = useCapabilityStore((state) => state.sourceFilter);
  const statusFilter = useCapabilityStore((state) => state.statusFilter);
  const riskFilter = useCapabilityStore((state) => state.riskFilter);
  const agentFilter = useCapabilityStore((state) => state.agentFilter);
  const projectFilter = useCapabilityStore((state) => state.projectFilter);
  const search = useCapabilityStore((state) => state.search);
  const attentionOnly = useCapabilityStore((state) => state.attentionOnly);
  const statusView = useCapabilityStore((state) => state.statusView);
  const toggleSource = useCapabilityStore((state) => state.toggleSource);
  const toggleStatus = useCapabilityStore((state) => state.toggleStatus);
  const toggleRisk = useCapabilityStore((state) => state.toggleRisk);
  const setAgentFilter = useCapabilityStore((state) => state.setAgentFilter);
  const setProjectFilter = useCapabilityStore((state) => state.setProjectFilter);
  const clearFilters = useCapabilityStore((state) => state.clearFilters);
  const [open, setOpen] = useState(false);
  const [more, setMore] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const active = hasCapabilityFilters({
    search,
    sourceFilter,
    statusFilter,
    riskFilter,
    agentFilter,
    projectFilter,
    attentionOnly,
    statusView,
  });
  const chipCount = sourceFilter.length + statusFilter.length + riskFilter.length
    + (agentFilter !== "all" ? 1 : 0)
    + (projectFilter !== "all" ? 1 : 0);

  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  return (
    <div className="cap-filter-wrap" ref={menuRef}>
      <button
        type="button"
        className={`cap-filter-btn ${open || chipCount > 0 ? "active" : ""}`}
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => setOpen((value) => !value)}
      >
        <Filter size={13} strokeWidth={1.8} />
        Filter
        {chipCount > 0 && <span className="cap-filter-count">{chipCount}</span>}
      </button>
      {open && (
        <div className="cap-filter-pop" role="dialog" aria-label="Capability filters">
          <section>
            <h3>Source</h3>
            <div className="cap-chip-row">
              {SOURCES.map((source) => (
                <button
                  key={source}
                  type="button"
                  className={`cap-chip ${sourceFilter.includes(source) ? "active" : ""}`}
                  aria-pressed={sourceFilter.includes(source)}
                  onClick={() => toggleSource(source)}
                >
                  {chipLabel(source)}
                </button>
              ))}
            </div>
          </section>
          <section>
            <h3>Status</h3>
            <div className="cap-chip-row">
              {STATUSES.map((status) => (
                <button
                  key={status}
                  type="button"
                  className={`cap-chip ${statusFilter.includes(status) ? "active" : ""}`}
                  aria-pressed={statusFilter.includes(status)}
                  onClick={() => toggleStatus(status)}
                >
                  {chipLabel(status)}
                </button>
              ))}
            </div>
          </section>
          <section>
            <h3>Risk</h3>
            <div className="cap-chip-row">
              {RISKS.map((risk) => (
                <button
                  key={risk}
                  type="button"
                  className={`cap-chip ${riskFilter.includes(risk) ? "active" : ""}`}
                  aria-pressed={riskFilter.includes(risk)}
                  onClick={() => toggleRisk(risk)}
                >
                  {chipLabel(risk)}
                </button>
              ))}
            </div>
          </section>
          <button type="button" className="cap-link" onClick={() => setMore((value) => !value)}>
            {more ? "Hide extra filters" : "More filters"}
          </button>
          {more && (
            <>
              <section>
                <h3>Agent</h3>
                <SelectControl value={agentFilter} onChange={(event) => setAgentFilter(event.target.value)}>
                  <option value="all">All</option>
                  {BUILTIN_AGENTS.map((agent) => (
                    <option key={agent.id} value={agent.id}>{agent.name} Agent</option>
                  ))}
                </SelectControl>
              </section>
              <section>
                <h3>Project</h3>
                <SelectControl value={projectFilter} onChange={(event) => setProjectFilter(event.target.value as typeof projectFilter)}>
                  <option value="all">All</option>
                  <option value="current">Current</option>
                  <option value="global">Global</option>
                </SelectControl>
              </section>
            </>
          )}
          {active && (
            <button type="button" className="cap-filter-clear" onClick={clearFilters}>
              <X size={12} /> Clear filters
            </button>
          )}
        </div>
      )}
    </div>
  );
}
