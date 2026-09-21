import { Check, ChevronDown } from "lucide-react";
import type { PlanStepView, PresentationState } from "../../../lib/agent/conversation";
import { StatusGlyph } from "../StatusGlyph";

export function PlanBlock({
  steps,
  status,
  presentation,
  onToggle,
}: {
  steps: PlanStepView[];
  status: "running" | "completed";
  presentation: PresentationState;
  onToggle: () => void;
}) {
  const done = steps.filter((step) => step.status === "completed").length;
  const title = status === "completed"
    ? `Completed ${steps.length} task${steps.length === 1 ? "" : "s"}`
    : `Plan  ${done}/${steps.length} completed`;
  const detailsId = "plan-details";

  return (
    <div className="tool-activity">
      <button
        type="button"
        className="tool-activity-line"
        onClick={onToggle}
        onKeyDown={(event) => {
          if (event.key === "Escape" && presentation.expanded) {
            event.preventDefault();
            onToggle();
          }
        }}
        aria-expanded={presentation.expanded}
        aria-controls={detailsId}
      >
        <StatusGlyph status={status === "completed" ? "completed" : "running"} />
        <span className="tool-activity-title">{title}</span>
        <ChevronDown size={12} className={`block-chevron${presentation.expanded ? " open" : ""}`} />
      </button>
      {presentation.expanded && (
        <ol id={detailsId} className="plan-steps">
          {steps.map((step) => (
            <li key={step.id} className={`plan-step ${step.status}`}>
              <StatusGlyph status={step.status} />
              <span>{step.title}</span>
              {step.status === "completed" && <Check size={11} className="status-glyph success" />}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
