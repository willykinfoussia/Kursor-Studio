import { Ban, Check, CircleDashed, FileCode2, Hammer, LoaderCircle, Play, Puzzle, ShieldAlert, TestTubes, Type, Wrench } from "lucide-react";
import type { SuiteItem, SuiteStatus } from "../../lib/agent/verification";
import { formatDuration } from "../../lib/agent/verification/format";

export function VerificationCheckRow({
  item,
  selected,
  running,
  onSelect,
  onRun,
  onEdit,
  onDisable,
  onDelete,
}: {
  item: SuiteItem;
  selected: boolean;
  running: boolean;
  onSelect: () => void;
  onRun: () => void;
  onEdit: () => void;
  onDisable: () => void;
  onDelete: () => void;
}) {
  const Icon = iconFor(item.kind);
  const canDelete = item.kind === "custom" || item.kind === "files";
  const duration = formatDuration(item.durationMs);
  return (
    <li className={`verify-row kind-${item.kind} status-${item.status}${selected ? " selected" : ""}`}>
      <button type="button" className="verify-row-main" onClick={onSelect}>
        <span className={`verify-kind-icon kind-${item.kind}`} aria-hidden="true">
          <Icon size={14} />
        </span>
        <span className="verify-row-copy">
          <span className="verify-row-title">{item.name}</span>
          <span className="verify-row-meta">
            <span className="verify-kind-label">{item.kind.toUpperCase()}</span>
            <span className="verify-origin">{originLabel(item.origin)}</span>
            {item.command && <code>{item.command}</code>}
          </span>
        </span>
        <span className={`verify-row-status status-${item.status}`}>
          <StatusIcon status={item.status} />
          {statusLabel(item, duration)}
        </span>
      </button>
      <div className="verify-row-actions">
        <button type="button" className="cap-icon-btn" onClick={onRun} disabled={running || item.status === "disabled" || item.status === "not-configured"} aria-label={`Run ${item.name}`}>
          <Play size={12} />
        </button>
        <details className="verify-more">
          <summary aria-label={`Actions for ${item.name}`}>•••</summary>
          <div className="verify-menu" role="menu">
            <button type="button" role="menuitem" onClick={onEdit}>Edit</button>
            <button type="button" role="menuitem" onClick={onRun} disabled={running}>Run</button>
            <button type="button" role="menuitem" onClick={onSelect}>View output</button>
            <button type="button" role="menuitem" onClick={onDisable}>{item.origin === "disabled" ? "Enable" : "Disable"}</button>
            {canDelete && <button type="button" role="menuitem" className="danger" onClick={onDelete}>Delete</button>}
          </div>
        </details>
      </div>
    </li>
  );
}

function StatusIcon({ status }: { status: SuiteStatus }) {
  if (status === "running") return <LoaderCircle size={12} className="spin" />;
  if (status === "passed") return <Check size={12} />;
  if (status === "failed") return <Ban size={12} />;
  if (status === "blocked") return <ShieldAlert size={12} />;
  return <CircleDashed size={12} />;
}

function statusLabel(item: SuiteItem, duration: string | null) {
  const base = {
    idle: "Not run",
    waiting: "Waiting",
    running: "Running…",
    passed: "Passed",
    failed: item.result?.exitCode != null ? `Failed · exit ${item.result.exitCode}` : "Failed",
    blocked: "Blocked",
    skipped: "Skipped",
    disabled: "Disabled",
    "not-configured": "Not configured",
    cancelled: "Cancelled",
  }[item.status];
  return duration && (item.status === "passed" || item.status === "failed") ? `${base} · ${duration}` : base;
}

function originLabel(origin: SuiteItem["origin"]) {
  if (origin === "auto") return "Auto";
  if (origin === "custom") return "Custom";
  if (origin === "disabled") return "Disabled";
  return "Absent";
}

function iconFor(kind: SuiteItem["kind"]) {
  if (kind === "typecheck") return Type;
  if (kind === "lint") return Wrench;
  if (kind === "test") return TestTubes;
  if (kind === "build") return Hammer;
  if (kind === "runtime") return Play;
  if (kind === "files") return FileCode2;
  return Puzzle;
}
