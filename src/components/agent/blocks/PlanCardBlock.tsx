import { useEffect, useState } from "react";
import { ListTodo } from "lucide-react";
import { buildPlan, isPlanBuildable } from "../../../lib/agent/plans/buildPlan";
import { planProgress } from "../../../lib/agent/plans/types";
import { planByRef, usePlanStore } from "../../../stores/planStore";
import { useEditorStore } from "../../../stores/editorStore";
import { useAgentStore } from "../../../stores/agentStore";

export function PlanCardBlock({ planId }: { planId: string }) {
  const plan = usePlanStore((state) => planByRef(state, planId));
  const isStreaming = useAgentStore((state) => state.isStreaming);
  const [building, setBuilding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!plan) void usePlanStore.getState().loadPlan(planId);
  }, [plan, planId]);

  if (!plan) {
    return (
      <div className="plan-card" aria-label="Plan loading">
        <p className="plan-card-eyebrow"><ListTodo size={12} /> Created Plan</p>
        <p className="plan-card-loading">Loading plan…</p>
      </div>
    );
  }

  const { done, total } = planProgress(plan);
  const buildable = isPlanBuildable(plan, isStreaming);
  const busy = building || isStreaming;
  const buttonLabel = plan.status === "building" && isStreaming
    ? "Building…"
    : plan.status === "done"
      ? `${done} of ${total} To-dos Completed`
      : "Build";

  const onBuild = async () => {
    if (!buildable || busy) return;
    setBuilding(true);
    setError(null);
    try {
      const result = await buildPlan(plan.id);
      if (!result.ok) setError(result.message);
    } finally {
      setBuilding(false);
    }
  };

  return (
    <div className="plan-card" data-plan-id={plan.id}>
      <p className="plan-card-eyebrow"><ListTodo size={12} /> Created Plan</p>
      <h4 className="plan-card-title">{plan.name}</h4>
      {plan.overview && <p className="plan-card-overview">{plan.overview}</p>}
      {total > 0 && (
        <p className="plan-card-count">
          {done} of {total} To-do{total === 1 ? "" : "s"}
          {plan.status === "done" ? " Completed" : ""}
        </p>
      )}
      {error && <p className="plan-card-error" role="alert">{error}</p>}
      <div className="plan-card-actions">
        <button
          type="button"
          className="text-link"
          onClick={() => {
            void useEditorStore.getState().openFile(plan.path);
          }}
        >
          View Plan
        </button>
        <button
          type="button"
          className="plan-build-btn"
          disabled={!buildable || busy}
          aria-keyshortcuts="Control+Enter"
          onClick={() => void onBuild()}
        >
          {buttonLabel}
          {buildable && !busy && <kbd>Ctrl+↵</kbd>}
        </button>
      </div>
    </div>
  );
}
