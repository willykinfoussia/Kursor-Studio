const ITEMS = [
  ["agent", "Agent"],
  ["task", "Task"],
  ["tool", "Tool"],
  ["context", "Context"],
  ["memory", "Memory"],
  ["rag", "RAG"],
  ["skill", "Skill"],
  ["verification", "Verification"],
  ["review", "Review"],
  ["error", "Error"],
  ["result", "Result"],
] as const;

const STATUSES = [
  ["idle", "Idle"],
  ["skipped", "Skipped"],
  ["running", "Running"],
] as const;

export function WorkflowLegend() {
  return (
    <div className="wf-legend-wrap">
      <ul className="wf-legend" aria-label="Legend">
        {ITEMS.map(([type, label]) => (
          <li key={type}><span className={`wf-swatch type-${type}`} />{label}</li>
        ))}
      </ul>
      <ul className="wf-legend" aria-label="Status">
        {STATUSES.map(([status, label]) => (
          <li key={status}><span className={`wf-swatch status-${status}`} />{label}</li>
        ))}
      </ul>
    </div>
  );
}
