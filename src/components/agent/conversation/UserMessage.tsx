import type { ReactNode } from "react";
import { fileName } from "../../../lib/filesystem/pathUtils";
import { fileMentionSpans } from "../../../lib/agent/context/tokens";
import { useEditorStore } from "../../../stores/editorStore";

export function UserMessage({ content }: { content: string }) {
  const openFile = useEditorStore((state) => state.openFile);
  const spans = fileMentionSpans(content);
  const parts: ReactNode[] = [];
  let cursor = 0;
  for (const span of spans) {
    if (span.start > cursor) {
      parts.push(<span key={`text-${cursor}`}>{content.slice(cursor, span.start)}</span>);
    }
    parts.push(
      <button
        key={`file-${span.start}`}
        type="button"
        className="file-mention"
        title={span.path}
        onClick={() => void openFile(span.path)}
      >
        {fileName(span.path)}
      </button>,
    );
    cursor = span.end;
  }
  if (cursor < content.length) {
    parts.push(<span key={`text-${cursor}`}>{content.slice(cursor)}</span>);
  }

  return (
    <article className="message user">
      <div className="message-label">You</div>
      <div className="message-body">{parts.length > 0 ? parts : content}</div>
    </article>
  );
}
