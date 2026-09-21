import { useState } from "react";
import type { QuestionChoice } from "../../../lib/agent/workflow/questionOptions";
import { MarkdownRenderer } from "../markdown/MarkdownRenderer";

export function QuestionBlock({
  prompt,
  options,
  selected,
  onAnswer,
}: {
  prompt: string;
  options: QuestionChoice[];
  selected?: string;
  onAnswer?: (selected: string) => void;
}) {
  const [custom, setCustom] = useState("");
  const answered = Boolean(selected);
  const submitCustom = () => {
    const text = custom.trim();
    if (!text || answered || !onAnswer) return;
    onAnswer(text);
  };

  return (
    <div className="question-block" aria-label="Agent question">
      <div className="question-prompt md">
        <MarkdownRenderer content={prompt} />
      </div>
      <div className="question-options">
        {options.map((option) => {
          const active = selected === option.label || selected === option.id;
          return (
            <button
              key={option.id}
              type="button"
              className={`question-option${active ? " selected" : ""}`}
              disabled={answered || !onAnswer}
              onClick={() => onAnswer?.(option.label)}
            >
              <span className="question-option-label">{option.label}</span>
              {option.description ? <span className="question-option-desc">{option.description}</span> : null}
            </button>
          );
        })}
      </div>
      {answered ? (
        <p className="question-answered">Answered: {selected}</p>
      ) : (
        <form
          className="question-custom"
          onSubmit={(event) => {
            event.preventDefault();
            submitCustom();
          }}
        >
          <input
            type="text"
            className="question-custom-input"
            placeholder="Autre réponse"
            value={custom}
            onChange={(event) => setCustom(event.target.value)}
            aria-label="Autre réponse"
          />
          <button type="submit" className="question-custom-send" disabled={!custom.trim() || !onAnswer}>
            Envoyer
          </button>
        </form>
      )}
    </div>
  );
}
