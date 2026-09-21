import { DEFAULT_GRAPH_FILTERS, type GraphFilterCategory } from "../../lib/workflow/types";
import { useWorkflowStore } from "../../stores/workflowStore";

const LABELS: Record<GraphFilterCategory, string> = {
  agents: "Agents",
  tasks: "Tasks",
  tools: "Tools",
  files: "Files",
  context: "Context",
  memory: "Memory",
  rag: "RAG",
  skills: "Skills",
  git: "Git",
  verification: "Verification",
  errors: "Errors",
  models: "Models",
  approvals: "Approvals",
  results: "Results",
  mcp: "MCP",
};

const CAPABILITY_FILTERS: GraphFilterCategory[] = ["skills", "tools", "mcp"];

export function WorkflowFilters() {
  const filters = useWorkflowStore((state) => state.filters);
  const toggleFilter = useWorkflowStore((state) => state.toggleFilter);
  const categories = Object.keys(DEFAULT_GRAPH_FILTERS) as GraphFilterCategory[];
  const rest = categories.filter((category) => !CAPABILITY_FILTERS.includes(category));
  return (
    <section className="wf-filters" aria-label="Filters">
      <h3>Filters</h3>
      {rest.map((category) => (
        <label key={category}>
          <input type="checkbox" checked={filters[category]} onChange={() => toggleFilter(category)} />
          {LABELS[category]}
        </label>
      ))}
      <h3>Capabilities</h3>
      {CAPABILITY_FILTERS.map((category) => (
        <label key={category}>
          <input type="checkbox" checked={filters[category]} onChange={() => toggleFilter(category)} />
          {LABELS[category]}
        </label>
      ))}
    </section>
  );
}
