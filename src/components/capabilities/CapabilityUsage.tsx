import type { CapabilityStats } from "../../lib/capabilities/types";
import { openCapabilityUsage } from "../../lib/workflow/navigation";

function relative(timestamp: number | null) {
  if (!timestamp) return "Never used";
  const delta = Date.now() - timestamp;
  if (delta < 60_000) return "just now";
  if (delta < 3_600_000) return `${Math.round(delta / 60_000)} minutes ago`;
  if (delta < 86_400_000) return `${Math.round(delta / 3_600_000)} hours ago`;
  return `${Math.round(delta / 86_400_000)} days ago`;
}

export function CapabilityUsageBlock({
  stats,
  capabilityId,
}: {
  stats: CapabilityStats;
  capabilityId: string;
}) {
  return (
    <section>
      <h3>Usage</h3>
      <dl className="cap-dl">
        <div><dt>Last used</dt><dd>{relative(stats.lastUsedAt)}</dd></div>
        <div><dt>Uses</dt><dd>{stats.totalUses}</dd></div>
        <div><dt>Success</dt><dd>{stats.successRate == null ? "—" : `${Math.round(stats.successRate * 100)}%`}</dd></div>
        <div><dt>Avg duration</dt><dd>{stats.avgDurationMs == null ? "—" : `${stats.avgDurationMs} ms`}</dd></div>
      </dl>
      {stats.recentRuns.length > 0 && (
        <>
          <h3>Recent usage</h3>
          <ul className="cap-runs">
            {stats.recentRuns.map((run) => (
              <li key={run.runId}>
                <span>Run #{run.runId.slice(0, 4).toUpperCase()} {run.title}</span>
                {run.usageInstanceId && (
                  <button
                    type="button"
                    className="cap-link"
                    onClick={() => openCapabilityUsage(run.runId, run.usageInstanceId!, capabilityId)}
                  >
                    View in Workflow
                  </button>
                )}
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
