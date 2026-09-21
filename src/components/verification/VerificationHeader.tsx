import { FlaskConical, Plus, Square } from "lucide-react";

export function VerificationHeader({
  running,
  stopping,
  progress,
  current,
  onRun,
  onStop,
  onConfigure,
  onAdd,
  disabled,
}: {
  running: boolean;
  stopping: boolean;
  progress?: string | null;
  current?: string | null;
  onRun: () => void;
  onStop: () => void;
  onConfigure: () => void;
  onAdd: () => void;
  disabled?: boolean;
}) {
  return (
    <header className="verify-header">
      <div className="verify-header-copy">
        <p className="verify-kicker">Evidence over claims</p>
        <h1>Project Tests</h1>
        <p className="verify-subtitle">Verify, monitor and understand the health of your project.</p>
      </div>
      <div className="verify-header-actions">
        <button type="button" className="cap-filter-btn" onClick={onConfigure} disabled={disabled}>
          Configure
        </button>
        {running ? (
          <button type="button" className="primary-btn" onClick={onStop} aria-live="polite">
            <Square size={12} fill="currentColor" />
            {stopping ? "Stopping…" : "Stop"}
          </button>
        ) : (
          <button type="button" className="primary-btn" onClick={onRun} disabled={disabled}>
            <FlaskConical size={13} />
            Run verification
          </button>
        )}
        <button type="button" className="cap-icon-btn" onClick={onAdd} aria-label="Add check" disabled={disabled}>
          <Plus size={14} />
        </button>
      </div>
      {running && (
        <p className="verify-progress" role="status">
          <span className="verify-dot" aria-hidden="true" />
          Verifying… {progress}{current ? ` · Current: ${current}` : ""}
        </p>
      )}
    </header>
  );
}
