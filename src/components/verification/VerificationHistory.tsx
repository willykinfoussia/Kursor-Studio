import type { VerificationHistoryEntry } from "../../lib/agent/verification/types";
import { formatRelative } from "../../lib/agent/verification/format";

export function VerificationHistory({
  history,
}: {
  history: VerificationHistoryEntry[];
}) {
  const chronological = [...history].reverse();
  return (
    <section className="verify-panel">
      <h2>Verification history</h2>
      {history.length === 0 ? (
        <p className="verify-muted">No verification run yet. Run the project verification suite to establish a baseline.</p>
      ) : (
        <ul className="verify-history">
          {rowsFrom(history).map((row, index) => (
            row.kind === "repair" ? (
              <li key={`repair-${index}`} className="repair">Agent repair</li>
            ) : (
              <li key={row.entry.id} className={row.entry.ok ? "ok" : "fail"}>
                <span>{row.entry.ok ? "✓" : "✕"} {row.entry.passed}/{row.entry.passed + row.entry.failed} passed</span>
                <span>{formatRelative(row.entry.timestamp) ?? ""} · {row.entry.trigger}</span>
                {row.entry.attempt > 1 && <span>attempt {row.entry.attempt}</span>}
              </li>
            )
          ))}
        </ul>
      )}
      {history.length >= 2 && (
        <>
          <div className="verify-trend" aria-label="Pass/fail trend">
            {chronological.map((entry) => (
              <span key={entry.id} className={entry.ok ? "ok" : "fail"} title={entry.ok ? "passed" : "failed"} />
            ))}
          </div>
          <p className="verify-muted">Pass rate {Math.round((history.filter((item) => item.ok).length / history.length) * 100)}% over {history.length} runs.</p>
        </>
      )}
    </section>
  );
}

function rowsFrom(history: VerificationHistoryEntry[]) {
  const rows: Array<{ kind: "entry"; entry: VerificationHistoryEntry } | { kind: "repair" }> = [];
  for (let index = 0; index < history.length; index += 1) {
    const entry = history[index]!;
    rows.push({ kind: "entry", entry });
    const previous = history[index + 1];
    if (
      previous
      && previous.requestId === entry.requestId
      && entry.attempt > previous.attempt
      && !previous.ok
      && entry.trigger === "agent"
    ) {
      rows.push({ kind: "repair" });
    }
  }
  return rows;
}
