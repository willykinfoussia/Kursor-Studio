import { Bot } from "lucide-react";

const SUGGESTIONS = [
  "Explique-moi ce projet",
  "Corrige les erreurs de TypeScript",
  "Ajoute une page de login",
];

export function EmptyState({ onSuggest }: { onSuggest: (text: string) => void }) {
  return (
    <div className="agent-empty">
      <Bot size={18} />
      <strong>Kursor Agent</strong>
      <span>Build, debug and understand your project.</span>
      <div className="empty-suggestions">
        <span className="empty-try">Try:</span>
        {SUGGESTIONS.map((suggestion) => (
          <button
            type="button"
            key={suggestion}
            className="empty-suggestion"
            onClick={() => onSuggest(suggestion)}
          >
            {suggestion}
          </button>
        ))}
      </div>
    </div>
  );
}
