export function ThoughtSummary({
  thinking,
  durationMs,
}: {
  thinking: boolean;
  durationMs: number | null;
}) {
  if (!thinking && (durationMs == null || durationMs < 400)) return null;
  const seconds = Math.max(1, Math.round((durationMs ?? 0) / 1000));
  return (
    <div className={`thought-summary${thinking ? " thinking" : ""}`} role="status">
      {thinking ? "Thinking…" : `Thought ${seconds}s`}
    </div>
  );
}
