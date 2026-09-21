import { ChevronDown } from "lucide-react";
import { CopyButton } from "../markdown/CopyButton";
import { StatusGlyph } from "../StatusGlyph";
import { extractKnownFilePath, formatDuration, isProcessTool, toolTarget, type PresentationState } from "../../../lib/agent/conversation";
import { parseRuntimeToolName } from "../../../lib/mcp/ids";
import type { ToolCall } from "../../../types/agent";
import { ProcessBlock } from "./ProcessBlock";
import { useEditorStore } from "../../../stores/editorStore";
import { ViewInWorkflowButton } from "./ViewInWorkflowButton";
import { useState } from "react";

function mcpLabels(tool: string) {
  const parsed = parseRuntimeToolName(tool);
  if (!parsed) return null;
  const server = parsed.serverId.replace(/-/g, " ");
  const title = server.replace(/\b\w/g, (char) => char.charAt(0).toUpperCase() + char.slice(1));
  return { server: `${title} MCP`, tool: parsed.toolName };
}

export function ToolBlock({
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
  if (isProcessTool(tool.tool)) {
    return <ProcessBlock tool={tool} presentation={presentation} onToggle={onToggle} onStop={onStop} />;
  }

  const mcp = mcpLabels(tool.tool);
  const target = toolTarget(tool.input);
  const duration = formatDuration(tool.startedAt, tool.finishedAt);
  const path = extractKnownFilePath(tool.input);
  const title = mcp ? mcp.server : tool.tool.replaceAll("_", " ");
  const subtitle = mcp ? mcp.tool : target;
  const detailsId = `${tool.id}-details`;

  if (!presentation.expanded) {
    return (
      <button type="button" className="tool-activity-line" onClick={onToggle} aria-expanded={false} aria-controls={detailsId}>
        <StatusGlyph status={tool.status} />
        <span className="tool-activity-title">{title}</span>
        {subtitle && <span className="block-meta">{subtitle}</span>}
        {duration && <span className="block-meta">{duration}</span>}
        <ChevronDown size={12} className="block-chevron" />
      </button>
    );
  }

  return (
    <div className="tool-activity">
      <button type="button" className="tool-activity-line" onClick={onToggle} aria-expanded aria-controls={detailsId}>
        <StatusGlyph status={tool.status} />
        <span className="tool-activity-title">{title}</span>
        {subtitle && <span className="block-meta">{subtitle}</span>}
        {duration && <span className="block-meta">{duration}</span>}
        <ChevronDown size={12} className="block-chevron open" />
      </button>
      {presentation.showDetails && (
        <ToolCallDetails id={detailsId} tool={tool} path={path} />
      )}
    </div>
  );
}

function ToolCallDetails({ id, tool, path }: { id: string; tool: ToolCall; path: string | null }) {
  const [raw, setRaw] = useState(false);
  return (
    <div id={id} className="tool-group-details">
      {path && (
        <button type="button" className="copy-btn" onClick={() => void useEditorStore.getState().openFile(path)}>
          Open {path}
        </button>
      )}
      <ViewInWorkflowButton nodeId={`tool:${tool.id}`} />
      <button type="button" className="text-link" onClick={() => setRaw((value) => !value)} aria-expanded={raw}>
        Raw details
      </button>
      {raw && (
        <div className="tool-io">
          <div className="tool-io-head">INPUT <CopyButton text={stringify(tool.input)} /></div>
          <pre className="tool-io-pre">{truncate(stringify(tool.input), 2000)}</pre>
          {tool.output !== undefined && (
            <>
              <div className="tool-io-head">OUTPUT <CopyButton text={stringify(tool.output)} /></div>
              <pre className="tool-io-pre">{truncate(stringify(tool.output), 4000)}</pre>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function stringify(value: unknown) {
  try {
    return JSON.stringify(value, null, 2) ?? "";
  } catch {
    return String(value);
  }
}

function truncate(value: string, max: number) {
  if (value.length <= max) return value;
  return `${value.slice(0, max)}\n…`;
}
