import { shortRunId } from "../../lib/workflow/GraphSelection";
import type { AgentRun } from "../../lib/workflow/types";
import { useRunStore } from "../../stores/runStore";

export function WorkflowRunList({ runs }: { runs: AgentRun[] }) {
  const viewedRunId = useRunStore((state) => state.viewedRunId);
  const loadRun = useRunStore((state) => state.loadRun);
  const grouped = groupByDay(runs);

  return (
    <section className="wf-runs" aria-label="Recent runs">
      <h3>Recent Runs</h3>
      {grouped.map(([label, items]) => (
        <div key={label}>
          <div className="wf-runs-day">{label}</div>
          {items.map((run) => (
            <button
              type="button"
              key={run.id}
              className={run.id === viewedRunId ? "active" : ""}
              onClick={() => void loadRun(run.id)}
            >
              <span>#{shortRunId(run.id)}</span>
              <span>{run.title || "Agent run"}</span>
              <span className={`wf-run-status ${run.status}`}>{run.status === "completed" ? "✓" : run.status === "failed" ? "✕" : "●"}</span>
            </button>
          ))}
        </div>
      ))}
      {runs.length === 0 && <p className="wf-muted">No recorded runs yet.</p>}
    </section>
  );
}

function groupByDay(runs: AgentRun[]) {
  const groups = new Map<string, AgentRun[]>();
  for (const run of runs) {
    const label = dayLabel(run.startedAt);
    const list = groups.get(label) ?? [];
    list.push(run);
    groups.set(label, list);
  }
  return [...groups.entries()];
}

function dayLabel(ts: number) {
  const date = new Date(ts);
  const today = new Date();
  if (date.toDateString() === today.toDateString()) return "Today";
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (date.toDateString() === yesterday.toDateString()) return "Yesterday";
  return date.toLocaleDateString();
}
