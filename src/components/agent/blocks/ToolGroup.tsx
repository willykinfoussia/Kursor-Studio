import { ChevronDown, FileCode2 } from "lucide-react";
import { useState, type KeyboardEvent, type ReactNode } from "react";
import { StatusGlyph } from "../StatusGlyph";
import type { ConversationItem, PresentationState } from "../../../lib/agent/conversation";
import {
  activeToolLabel,
  commandFromTool,
  extractKnownFilePath,
  formatDiffCounts,
  formatDuration,
  processOutput,
  summarizeToolGroup,
  toolFamily,
  toolTarget,
} from "../../../lib/agent/conversation";
import type { ToolCall } from "../../../types/agent";
import { CopyButton } from "../markdown/CopyButton";
import { ViewInWorkflowButton } from "./ViewInWorkflowButton";
import { useEditorStore } from "../../../stores/editorStore";
import { useReviewStore } from "../../../stores/reviewStore";

export function ToolGroup({
  items,
  tools,
  presentation,
  onToggle,
}: {
  items: Extract<ConversationItem, { type: "tool" }>[];
  tools: Map<string, ToolCall>;
  presentation: PresentationState;
  onToggle: () => void;
  onToggleChild?: (id: string) => void;
  childExpanded?: Record<string, boolean>;
  onStop?: () => void;
}) {
  const calls = items.map((item) => tools.get(item.toolCallId)).filter((item): item is ToolCall => Boolean(item));
  const summary = summarizeToolGroup(calls);
  const running = calls.find((call) => call.status === "running" || call.status === "pending");
  const finished = calls.filter((call) => call.status !== "running" && call.status !== "pending");
  const detailsId = `${items[0]?.id ?? "group"}-details`;
  const diff = formatDiffCounts(summary.added, summary.removed);
  const failed = summary.failed > 0;

  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === "Escape" && presentation.expanded) {
      event.preventDefault();
      onToggle();
    }
  };

  return (
    <div className={`tool-activity${failed ? " failed" : ""}`}>
      {finished.length > 0 && (
        <button
          type="button"
          className="tool-activity-line"
          onClick={onToggle}
          onKeyDown={onKeyDown}
          aria-expanded={presentation.expanded}
          aria-controls={detailsId}
        >
          <StatusGlyph status={failed ? "failed" : "completed"} />
          <span className="tool-activity-title">{summary.title}</span>
          {diff && <span className="block-meta">{diff}</span>}
          <ChevronDown size={12} className={`block-chevron${presentation.expanded ? " open" : ""}`} />
        </button>
      )}
      {running && (
        finished.length > 0 ? (
          <div className="tool-activity-line active" role="status">
            <StatusGlyph status="running" />
            <span>{activeToolLabel(running.tool, running.input)}</span>
          </div>
        ) : (
          <button
            type="button"
            className="tool-activity-line active"
            onClick={onToggle}
            onKeyDown={onKeyDown}
            aria-expanded={presentation.expanded}
            aria-controls={detailsId}
          >
            <StatusGlyph status="running" />
            <span>{activeToolLabel(running.tool, running.input)}</span>
          </button>
        )
      )}
      {presentation.expanded && (
        <ToolGroupDetails id={detailsId} calls={calls} />
      )}
    </div>
  );
}

function ToolGroupDetails({
  id,
  calls,
}: {
  id: string;
  calls: ToolCall[];
}) {
  const exploreFiles = unique(calls.filter((call) => toolFamily(call.tool) === "explore").map((call) => extractKnownFilePath(call.input) ?? extractKnownFilePath(call.output)).filter((item): item is string => Boolean(item)));
  const editFiles = unique(calls.filter((call) => toolFamily(call.tool) === "edit").map((call) => extractKnownFilePath(call.input) ?? extractKnownFilePath(call.output)).filter((item): item is string => Boolean(item)));
  const searches = unique(calls.filter((call) => call.tool === "search_files" || call.tool === "web_search").map((call) => toolTarget(call.input)));
  const commands = calls.filter((call) => toolFamily(call.tool) === "terminal");
  const skills = unique(calls.filter((call) => toolFamily(call.tool) === "skill").map((call) => toolTarget(call.input)).filter(Boolean));
  const other = calls.filter((call) => {
    const family = toolFamily(call.tool);
    return family !== "explore" && family !== "edit" && family !== "terminal" && family !== "skill" && family !== "web";
  });

  return (
    <div id={id} className="tool-group-details">
      {skills.length > 0 && (
        <DetailSection label="Skills">
          {skills.map((skill) => (
            <div key={skill} className="tool-detail-row">{skill}</div>
          ))}
        </DetailSection>
      )}
      {exploreFiles.length > 0 && (
        <DetailSection label="Read">
          {exploreFiles.map((path) => (
            <FileRow key={path} path={path} />
          ))}
        </DetailSection>
      )}
      {searches.length > 0 && (
        <DetailSection label="Searches">
          {searches.map((query) => (
            <div key={query} className="tool-detail-row muted">{query}</div>
          ))}
        </DetailSection>
      )}
      {editFiles.length > 0 && (
        <DetailSection label="Files">
          {editFiles.map((path) => (
            <FileRow key={path} path={path} flag="M" />
          ))}
          <div className="tool-detail-actions">
            <button type="button" className="text-link" onClick={() => openDiff()}>Review changes</button>
          </div>
        </DetailSection>
      )}
      {commands.length > 0 && (
        <DetailSection label="Commands">
          {commands.map((call) => (
            <CommandRow key={call.id} call={call} />
          ))}
        </DetailSection>
      )}
      {other.length > 0 && (
        <ul className="tool-group-list">
          {other.map((call) => (
            <li key={call.id} className="tool-group-row">
              <StatusGlyph status={call.status} />
              <span className="tool-name">{call.tool}</span>
              <span className="block-meta">{toolTarget(call.input)}</span>
            </li>
          ))}
        </ul>
      )}
      <ViewInWorkflowButton nodeId={`tool:${calls[0]?.id ?? ""}`} />
      <RawDetails calls={calls} />
    </div>
  );
}

function DetailSection({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="tool-detail-section">
      <div className="tool-detail-label">{label}</div>
      {children}
    </div>
  );
}

function FileRow({ path, flag }: { path: string; flag?: string }) {
  return (
    <button type="button" className="tool-detail-row file-row" onClick={() => void useEditorStore.getState().openFile(path)}>
      {flag && <span className={`change-flag ${flag}`}>{flag}</span>}
      <FileCode2 size={11} />
      <span>{path}</span>
    </button>
  );
}

function CommandRow({ call }: { call: ToolCall }) {
  const command = commandFromTool(call.input, call.output);
  const output = processOutput(call.output);
  const duration = formatDuration(call.startedAt, call.finishedAt);
  const log = [output.stdout, output.stderr].filter(Boolean).join("\n");
  return (
    <div className="command-detail">
      <div className="tool-group-row">
        <StatusGlyph status={call.status} />
        <code className="process-command">{command}</code>
        {duration && <span className="block-meta">{duration}</span>}
        <CopyButton text={command} />
      </div>
      {log && <pre className="terminal-log">{log}</pre>}
    </div>
  );
}

function RawDetails({ calls }: { calls: ToolCall[] }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="raw-details">
      <button type="button" className="text-link" onClick={() => setOpen((value) => !value)} aria-expanded={open}>
        Raw details
      </button>
      {open && (
        <pre className="tool-io-pre">
          {calls.map((call) => `${call.tool} ${JSON.stringify(call.input)}\n${stringify(call.output)}`).join("\n\n")}
        </pre>
      )}
    </div>
  );
}

function openDiff() {
  useReviewStore.getState().openReview();
}

function unique(values: string[]) {
  return [...new Set(values.filter(Boolean))];
}

function stringify(value: unknown) {
  try {
    return JSON.stringify(value, null, 2) ?? "";
  } catch {
    return String(value);
  }
}
