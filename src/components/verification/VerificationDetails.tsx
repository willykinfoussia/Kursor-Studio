import { CopyButton } from "../agent/markdown/CopyButton";
import { outputIsClipped } from "../../lib/agent/verification";
import { formatClock, formatDuration, verificationPhaseLabel, type VerificationPhase } from "../../lib/agent/verification/format";
import type { SuiteItem } from "../../lib/agent/verification";
import { MAX_VERIFY_OUTPUT_CHARS } from "../../lib/agent/verification/types";

export function VerificationDetails({
  item,
  phase,
  elapsed,
  startedAt,
  trigger,
  requestId,
  executedAt,
  onClose,
  onOpenFile,
  onOpenWorkflow,
}: {
  item: SuiteItem | null;
  phase: VerificationPhase;
  elapsed?: string | null;
  startedAt?: number | null;
  trigger: "agent" | "manual" | null;
  requestId: string | null;
  executedAt?: number | null;
  onClose: () => void;
  onOpenFile?: (path: string) => void;
  onOpenWorkflow?: () => void;
}) {
  if (!item) return null;
  const result = item.result;
  const output = [result?.stdout, result?.stderr].filter(Boolean).join("\n\n");
  const live = phase === "launching" || ((phase === "running" || phase === "approval") && item.status === "running");
  const who = trigger === "agent" && requestId
    ? `Agent run ${requestId.slice(0, 8)}`
    : trigger === "manual"
      ? "Manual verification"
      : "Not available";
  return (
    <aside className="verify-details" aria-label={`${item.name} results`}>
      <div className="cap-details-toolbar">
        <button type="button" className="cap-details-close" onClick={onClose}>Close</button>
      </div>
      <p className="verify-kind-label">{item.kind.toUpperCase()}</p>
      <h2>{item.name}</h2>
      <p className={`verify-row-status status-${phase === "error" ? "failed" : live ? "running" : item.status}`} role="status">
        {phase === "error" ? "Could not start" : detailStatus(phase, item)}{live && elapsed ? ` · ${elapsed}` : ""}
      </p>
      <h3>Command</h3>
      <code className="verify-command">{item.command ?? "—"}</code>
      <h3>{live ? "Elapsed" : "Duration"}</h3>
      <p>{live ? (elapsed ?? "0s") : (formatDuration(item.durationMs) ?? "Not available")}</p>
      <h3>Exit code</h3>
      <p>{result?.denied ? "blocked" : result?.exitCode ?? (live ? "Running" : "Not available")}</p>
      <h3>{live ? "Started" : "Executed"}</h3>
      <p>{formatClock(live ? startedAt : executedAt) ?? "Not available"}</p>
      <h3>Trigger</h3>
      <p>{who}</p>
      {result?.path && (
        <>
          <h3>Path</h3>
          <p>{result.path}</p>
        </>
      )}
      {result?.diagnosis && (
        <>
          <h3>Diagnostics</h3>
          <p>{result.diagnosis}</p>
        </>
      )}
      <h3>Output</h3>
      {output ? (
        <div className="verify-log">
          <div className="verify-log-head">
            <span>stdout / stderr</span>
            <CopyButton text={output} />
          </div>
          <pre className="verify-log-pre">{output}</pre>
          {outputIsClipped(output) && (
            <p className="verify-clip">Output clipped to {MAX_VERIFY_OUTPUT_CHARS.toLocaleString()} characters (same cap as agent repair).</p>
          )}
        </div>
      ) : (
        <p>{live ? "Command is running. Output appears when it finishes." : "No output yet."}</p>
      )}
      <p className="verify-note">TDD runs during implementation. VerificationEngine is the harness net after mutations or a manual run.</p>
      <div className="verify-detail-actions">
        {result?.path && onOpenFile && (
          <button type="button" className="primary-btn" onClick={() => onOpenFile(result.path!)}>Open file</button>
        )}
        {trigger === "agent" && onOpenWorkflow && (
          <button type="button" className="cap-filter-btn" onClick={onOpenWorkflow}>Open workflow</button>
        )}
      </div>
    </aside>
  );
}

function detailStatus(phase: VerificationPhase, item: SuiteItem) {
  if (phase === "launching" || phase === "running" || phase === "approval") {
    return verificationPhaseLabel(phase) ?? item.status.replace("-", " ");
  }
  return item.status.replace("-", " ");
}
