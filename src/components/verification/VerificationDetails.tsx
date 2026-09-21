import { CopyButton } from "../agent/markdown/CopyButton";
import { outputIsClipped } from "../../lib/agent/verification";
import { formatClock, formatDuration } from "../../lib/agent/verification/format";
import type { SuiteItem } from "../../lib/agent/verification";
import { MAX_VERIFY_OUTPUT_CHARS } from "../../lib/agent/verification/types";

export function VerificationDetails({
  item,
  trigger,
  requestId,
  executedAt,
  onClose,
  onOpenFile,
  onOpenWorkflow,
}: {
  item: SuiteItem | null;
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
      <p className={`verify-row-status status-${item.status}`}>{item.status.replace("-", " ")}</p>
      <h3>Command</h3>
      <code className="verify-command">{item.command ?? "—"}</code>
      <h3>Duration</h3>
      <p>{formatDuration(item.durationMs) ?? "Not available"}</p>
      <h3>Exit code</h3>
      <p>{result?.denied ? "blocked" : result?.exitCode ?? "Not available"}</p>
      <h3>Executed</h3>
      <p>{formatClock(executedAt) ?? "Not available"}</p>
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
        <p>No output yet.</p>
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
