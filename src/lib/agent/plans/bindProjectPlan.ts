import { latestPlanPath, planByPath, usePlanStore, writablePlanPath } from "../../../stores/planStore";
import type { PlanDocument, PlanStatus } from "./types";
import { isContinuationPrompt, type WorkflowSessionState } from "../workflow/sessionState";

const RESTORE_STATUSES = new Set<PlanStatus>(["approved", "building", "done"]);

function todosComplete(plan: PlanDocument): boolean {
  if (plan.status === "done") return true;
  const todos = plan.todos ?? [];
  return todos.length > 0 && todos.every((todo) => todo.status === "completed" || todo.status === "cancelled");
}

export function restoreSessionFromPlan(session: WorkflowSessionState, plan: PlanDocument): void {
  session.planPath = plan.path;
  session.setPlanTodosComplete(todosComplete(plan));
  if (!RESTORE_STATUSES.has(plan.status)) return;
  if (!session.designApproved) {
    session.designApproved = { scope: `Continue plan: ${plan.name}`, path: plan.path, at: Date.now() };
  }
  session.approvePlan();
  session.setInteractionMode("agent");
}

/** Bind the project's latest plan when a new chat continues/finalizes existing work. */
export function bindContinuingProjectPlan(
  session: WorkflowSessionState,
  prompt: string,
  state = usePlanStore.getState(),
): PlanDocument | null {
  if (session.planPath) return planByPath(state, session.planPath);
  if (!isContinuationPrompt(prompt)) return null;
  const path = writablePlanPath(state) ?? latestPlanPath(state);
  if (!path) return null;
  const plan = planByPath(state, path)
    ?? Object.values(state.plans).find((item) => item.path === path || item.id === path)
    ?? null;
  if (!plan) return null;
  restoreSessionFromPlan(session, plan);
  return plan;
}
