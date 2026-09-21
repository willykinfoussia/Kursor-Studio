import { MarkdownRenderer } from "../markdown/MarkdownRenderer";

export function AssistantMessage({
  content,
  streaming,
}: {
  content: string;
  streaming?: boolean;
}) {
  return (
    <article className="message assistant">
      <div className="message-body md">
        {content ? (
          <MarkdownRenderer content={content} streaming={streaming} />
        ) : streaming ? (
          <span className="stream-cursor" />
        ) : null}
        {content && streaming && <span className="stream-cursor" />}
      </div>
    </article>
  );
}
