import { ChevronDown, X } from "lucide-react";
import { StatusGlyph } from "../StatusGlyph";
import type { WorkStatus } from "../../../types/agent";
import type { PresentationState } from "../../../lib/agent/conversation";
import { activeToolLabel, toolTarget } from "../../../lib/agent/conversation";
import type { ToolCall } from "../../../types/agent";

export function TaskBlock({
  title,
  status,
  activity,
  childTools,
  presentation,
  sticky,
  onToggle,
  onDismissSticky,
}: {
  title: string;
  status: WorkStatus;
  activity?: string;
  childTools?: ToolCall[];
  presentation: PresentationState;
  sticky?: boolean;
  onToggle: () => void;
  onDismissSticky?: () => void;
}) {
  const preview = activity && activity !== title ? activity : undefined;
  const running = status === "running";

  if (sticky) {
    return (
      <div className="agent-sticky-task" role="status">
        <StatusGlyph status={running ? "running" : status} />
        <span className="sticky-title">{title}</span>
        {preview && <span className="block-meta">{preview}</span>}
        {onDismissSticky && (
          <button type="button" className="icon-btn" aria-label="Dismiss current task" onClick={onDismissSticky}>
            <X size={12} />
          </button>
        )}
      </div>
    );
  }

  const lineClass = `tool-activity-line${running ? " active" : ""}`;

  if (!presentation.expanded) {
    return (
      <button type="button" className={lineClass} onClick={onToggle} aria-expanded={false}>
        <StatusGlyph status={status} />
        <span className="tool-activity-title">{title}</span>
        {preview && <span className="block-meta">{preview}</span>}
        <ChevronDown size={12} className="block-chevron" />
      </button>
    );
  }

  return (
    <div className="tool-activity">
      <button type="button" className={lineClass} onClick={onToggle} aria-expanded>
        <StatusGlyph status={status} />
        <span className="tool-activity-title">{title}</span>
        {preview && <span className="block-meta">{preview}</span>}
        <ChevronDown size={12} className="block-chevron open" />
      </button>
      {childTools && childTools.length > 0 && (
        <ul className="tool-group-list">
          {childTools.map((call) => (
            <li key={call.id} className="tool-group-row">
              <StatusGlyph status={call.status} />
              <span className="tool-name">{activeToolLabel(call.tool, call.input).replace(/\.\.\.$/, "")}</span>
              <span className="block-meta">{toolTarget(call.input)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
