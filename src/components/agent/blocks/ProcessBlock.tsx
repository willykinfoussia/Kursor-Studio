import { ChevronDown } from "lucide-react";
import { CopyButton } from "../markdown/CopyButton";
import { StatusGlyph } from "../StatusGlyph";
import { commandFromTool, formatDuration, processOutput, type PresentationState } from "../../../lib/agent/conversation";
import type { ToolCall } from "../../../types/agent";
import { ViewInWorkflowButton } from "./ViewInWorkflowButton";

export function ProcessBlock({
  tool,
  presentation,
  onToggle,
  onStop,
}: {
  tool: ToolCall;
  presentation: PresentationState;
  onToggle: () => void;
  onStop?: () => void;
}) {
  const command = commandFromTool(tool.input, tool.output);
  const output = processOutput(tool.output);
  const duration = formatDuration(tool.startedAt, tool.finishedAt);
  const running = tool.tool === "start_process" && tool.status === "completed";
  const log = [output.stdout, output.stderr].filter(Boolean).join("\n");
  const detailsId = `${tool.id}-process`;

  if (running) {
    return (
      <div className="tool-activity">
        <div className="tool-activity-line active" role="status">
          <StatusGlyph status="running" />
          <span>Running {command}...</span>
        </div>
        <div className="tool-detail-actions">
          <button type="button" className="text-link" onClick={onToggle}>{presentation.expanded ? "Hide output" : "Show output"}</button>
          {onStop && <button type="button" className="permission-deny" onClick={onStop}>Stop</button>}
        </div>
        {presentation.expanded && log && <pre className="terminal-log">{log}</pre>}
      </div>
    );
  }

  return (
    <div className="tool-activity">
      <button
        type="button"
        className="tool-activity-line"
        onClick={onToggle}
        aria-expanded={presentation.expanded}
        aria-controls={detailsId}
      >
        <StatusGlyph status={tool.status} />
        <span className="process-command">{command}</span>
        {duration && <span className="block-meta">{duration}</span>}
        <ChevronDown size={12} className={`block-chevron${presentation.expanded ? " open" : ""}`} />
      </button>
      {presentation.expanded && (
        <div id={detailsId} className="tool-group-details">
          <div className="tool-io-head">OUTPUT <CopyButton text={log || command} /></div>
          {log && <pre className="terminal-log full">{log}</pre>}
          <ViewInWorkflowButton nodeId={`tool:${tool.id}`} />
        </div>
      )}
    </div>
  );
}
