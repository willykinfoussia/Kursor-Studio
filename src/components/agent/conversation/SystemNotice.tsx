import { AlertTriangle, History, Info, Undo2 } from "lucide-react";
import type { SystemNoticeKind } from "../../../lib/agent/conversation";

export function SystemNotice({
  kind,
  text,
  recovery,
  onRetry,
  onContinue,
  onRollback,
}: {
  kind: SystemNoticeKind;
  text: string;
  recovery?: boolean;
  onRetry?: () => void;
  onContinue?: () => void;
  onRollback?: () => void;
}) {
  const Icon = kind === "recovery" ? History : kind === "mode" || kind === "knowledge" ? Info : AlertTriangle;
  return (
    <div className={`system-notice notice-${kind}`} role="status">
      <Icon size={12} />
      <span>{text}</span>
      {recovery && (
        <div className="permission-actions">
          <button type="button" className="permission-allow" onClick={onRetry}>Retry</button>
          <button type="button" className="permission-allow-task" onClick={onContinue}>Continue</button>
          <button type="button" className="permission-deny" onClick={onRollback}><Undo2 size={11} /> Rollback</button>
        </div>
      )}
    </div>
  );
}
