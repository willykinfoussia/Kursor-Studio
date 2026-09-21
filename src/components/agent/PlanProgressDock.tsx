import { CheckCircle2, ChevronRight, ListTodo, RotateCcw, X } from "lucide-react";
import { planProgress } from "../../lib/agent/plans/types";
import type { PlanTodoStatus } from "../../lib/agent/plans/types";
import { StatusGlyph, type GlyphStatus } from "./StatusGlyph";
import { activePlan, usePlanStore } from "../../stores/planStore";
import { useAgentStore } from "../../stores/agentStore";
import { useEditorStore } from "../../stores/editorStore";

function glyphForTodo(status: PlanTodoStatus): GlyphStatus {
  if (status === "completed") return "completed";
  if (status === "in_progress") return "running";
  if (status === "cancelled") return "warning";
  return "pending";
}

export function PlanProgressDock() {
  const plan = usePlanStore(activePlan);
  const expanded = usePlanStore((state) => state.dockExpanded);
  const setExpanded = usePlanStore((state) => state.setDockExpanded);
  const dismissed = usePlanStore((state) => state.dockDismissed);
  const dockConversationId = usePlanStore((state) => state.dockConversationId);
  const activeConversationId = useAgentStore((state) => state.activeConversationId);
  const dismiss = usePlanStore((state) => state.dismissDock);

  if (!plan || dismissed) return null;
  if (!dockConversationId || dockConversationId !== activeConversationId) return null;
  if (plan.status !== "building" && plan.status !== "done") return null;

  const { done, total } = planProgress(plan);
  const allDone = total > 0 && done === total;

  return (
    <div className="plan-progress-dock" aria-label="Plan progress">
      <div className="plan-progress-bar">
        <button
          type="button"
          className="plan-progress-toggle"
          aria-expanded={expanded}
          onClick={() => setExpanded(!expanded)}
        >
          <ChevronRight size={12} className={expanded ? "open" : ""} />
          <strong>Build</strong>
          <ListTodo size={12} className="plan-progress-icon" />
          <span className="plan-progress-name">{plan.name}</span>
        </button>
        <span className="plan-progress-actions">
          <button
            type="button"
            className="icon-btn"
            title="Open plan"
            aria-label="Open plan"
            onClick={() => void useEditorStore.getState().openFile(plan.path)}
          >
            <RotateCcw size={12} />
          </button>
          {plan.status === "done" && (
            <button
              type="button"
              className="icon-btn"
              title="Dismiss"
              aria-label="Dismiss plan progress"
              onClick={() => dismiss()}
            >
              <X size={12} />
            </button>
          )}
        </span>
      </div>
      <p className="plan-progress-count">
        {allDone
          ? <CheckCircle2 size={13} className="status-glyph success" />
          : <StatusGlyph status="running" />}
        <span>{done} of {total} To-do{total === 1 ? "" : "s"} Completed</span>
      </p>
      {expanded && (
        <ul className="plan-progress-todos">
          {plan.todos.map((todo) => (
            <li key={todo.id} className={`plan-progress-todo status-${todo.status}`}>
              <StatusGlyph status={glyphForTodo(todo.status)} />
              <span>{todo.content}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
