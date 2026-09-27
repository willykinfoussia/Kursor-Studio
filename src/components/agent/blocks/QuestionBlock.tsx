import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { QuestionChoice } from "../../../lib/agent/workflow/questionOptions";
import {
  formatMatrixSelection,
  matrixRowPicks,
  parseMatrixQuestion,
  type MatrixRow,
} from "../../../lib/agent/workflow/questionOptions";
import { MarkdownRenderer } from "../markdown/MarkdownRenderer";

export interface QuestionPanelItem {
  questionId: string;
  prompt: string;
  options: QuestionChoice[];
  selected?: string;
}

interface QuestionSlide {
  key: string;
  questionId: string;
  intro?: string;
  title: string;
  markdown: boolean;
  options: QuestionChoice[];
  selected?: string;
  answered: boolean;
  rowNumber?: number;
  matrixRows?: MatrixRow[];
}

function buildSlides(questions: QuestionPanelItem[]): QuestionSlide[] {
  const slides: QuestionSlide[] = [];
  for (const question of questions) {
    const matrix = parseMatrixQuestion(question.prompt);
    const picks = matrix && question.selected ? matrixRowPicks(matrix.rows, question.selected) : null;
    if (matrix && (!question.selected || picks)) {
      for (const row of matrix.rows) {
        slides.push({
          key: `${question.questionId}:${row.n}`,
          questionId: question.questionId,
          intro: matrix.intro || undefined,
          title: row.title,
          markdown: false,
          options: row.choices.map((choice) => ({
            id: choice.id,
            label: choice.id,
            description: choice.label,
          })),
          selected: picks?.[row.n],
          answered: Boolean(question.selected),
          rowNumber: row.n,
          matrixRows: matrix.rows,
        });
      }
      continue;
    }
    slides.push({
      key: question.questionId,
      questionId: question.questionId,
      title: question.prompt,
      markdown: true,
      options: question.options,
      selected: question.selected,
      answered: Boolean(question.selected),
    });
  }
  return slides;
}

function firstPendingIndex(slides: QuestionSlide[], pendingId: string) {
  if (pendingId) {
    const at = slides.findIndex((slide) => slide.questionId === pendingId);
    if (at >= 0) return at;
  }
  return Math.max(0, slides.length - 1);
}

export function QuestionBlock({
  questions,
  onAnswer,
}: {
  questions: QuestionPanelItem[];
  onAnswer?: (questionId: string, selected: string) => void;
}) {
  const slides = useMemo(() => buildSlides(questions), [questions]);
  const pendingId = questions.find((question) => !question.selected)?.questionId ?? "";
  const [index, setIndex] = useState(() => firstPendingIndex(slides, pendingId));
  const [custom, setCustom] = useState("");
  const [picks, setPicks] = useState<Record<string, Record<number, string>>>({});
  const seenPending = useRef<string | null>(null);

  useEffect(() => {
    if (seenPending.current === null) {
      seenPending.current = pendingId;
      return;
    }
    if (seenPending.current === pendingId) return;
    seenPending.current = pendingId;
    if (!pendingId) return;
    setIndex(firstPendingIndex(slides, pendingId));
  }, [pendingId, slides]);

  const safeIndex = Math.min(Math.max(0, index), Math.max(0, slides.length - 1));
  const current = slides[safeIndex];
  if (!current) return null;

  const localLetter = current.rowNumber !== undefined
    ? picks[current.questionId]?.[current.rowNumber]
    : undefined;
  const shown = current.answered ? current.selected : (localLetter ?? current.selected);
  const answeredText = current.markdown
    ? current.selected
    : current.options.find((option) => option.id === shown)?.description ?? shown;

  const choose = (option: QuestionChoice) => {
    if (!onAnswer || current.answered) return;
    if (current.matrixRows && current.rowNumber !== undefined) {
      const nextPicks = {
        ...(picks[current.questionId] ?? {}),
        [current.rowNumber]: option.id,
      };
      setPicks((state) => ({ ...state, [current.questionId]: nextPicks }));
      const formatted = formatMatrixSelection(current.matrixRows, nextPicks);
      if (formatted) onAnswer(current.questionId, formatted);
      return;
    }
    onAnswer(current.questionId, option.label);
  };

  const submitCustom = () => {
    const text = custom.trim();
    if (!text || current.answered || !onAnswer) return;
    onAnswer(current.questionId, text);
  };

  return (
    <div className="question-block" aria-label="Agent question">
      {slides.length > 1 && (
        <header className="question-nav">
          <span>Question</span>
          <span className="question-nav-count">{safeIndex + 1} / {slides.length}</span>
          <button
            type="button"
            className="icon-btn"
            aria-label="Question précédente"
            disabled={safeIndex === 0}
            onClick={() => setIndex(safeIndex - 1)}
          >
            <ChevronLeft size={14} />
          </button>
          <button
            type="button"
            className="icon-btn"
            aria-label="Question suivante"
            disabled={safeIndex >= slides.length - 1}
            onClick={() => setIndex(safeIndex + 1)}
          >
            <ChevronRight size={14} />
          </button>
        </header>
      )}
      {current.intro ? (
        <div className="question-intro md">
          <MarkdownRenderer content={current.intro} />
        </div>
      ) : null}
      {current.markdown ? (
        <div className="question-prompt md">
          <MarkdownRenderer content={current.title} />
        </div>
      ) : (
        <p className="question-row-title">{current.title}</p>
      )}
      <div className="question-options">
        {current.options.map((option) => {
          const active = current.markdown
            ? shown === option.label || shown === option.id
            : shown === option.id;
          return (
            <button
              key={option.id}
              type="button"
              className={`question-option${active ? " selected" : ""}`}
              disabled={current.answered || !onAnswer}
              onClick={() => choose(option)}
            >
              <span className="question-option-label">{option.label}</span>
              {option.description ? <span className="question-option-desc">{option.description}</span> : null}
            </button>
          );
        })}
      </div>
      {current.answered ? (
        <p className="question-answered">Answered: {answeredText}</p>
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
