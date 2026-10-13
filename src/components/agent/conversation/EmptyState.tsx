const SUGGESTIONS = [
  "Create a web application",
  "Build a presentation",
  "Analyze a spreadsheet",
];

export function EmptyState({ onSuggest, immersive = false }: { onSuggest: (text: string) => void; immersive?: boolean }) {
  if (immersive) {
    return (
      <div className="mission-hero">
        <h1>What would you like to accomplish?</h1>
        <p>Describe your idea, project or desired result.</p>
        <div className="empty-suggestions mission-hero-suggestions">
          {SUGGESTIONS.map((suggestion) => (
            <button type="button" key={suggestion} className="empty-suggestion" onClick={() => onSuggest(suggestion)}>
              {suggestion}
            </button>
          ))}
        </div>
      </div>
    );
  }
  return (
    <div className="agent-empty">
      <strong>What would you like to accomplish?</strong>
      <span>Describe your idea, project or desired result.</span>
      <div className="empty-suggestions">
        {SUGGESTIONS.map((suggestion) => (
          <button type="button" key={suggestion} className="empty-suggestion" onClick={() => onSuggest(suggestion)}>
            {suggestion}
          </button>
        ))}
      </div>
    </div>
  );
}
