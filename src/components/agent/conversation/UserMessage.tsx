export function UserMessage({ content }: { content: string }) {
  return (
    <article className="message user">
      <div className="message-label">You</div>
      <div className="message-body">{content}</div>
    </article>
  );
}
