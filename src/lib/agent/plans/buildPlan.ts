import { agentRuntime } from "../AgentRuntime";
import { usePlanStore } from "../../../stores/planStore";
import type { PlanDocument } from "./types";

export { isBuildPlanPrompt } from "./isBuildPlanPrompt";

type BuildRuntime = Pick<typeof agentRuntime, "workflowSession" | "publish" | "setInteractionMode" | "sendMessage" | "isBusy">;

export interface BuildPlanDeps {
  runtime?: BuildRuntime;
}

export function isPlanBuildable(plan: PlanDocument | null | undefined, agentBusy = false): boolean {
  if (!plan || plan.todos.length === 0 || plan.status === "done") return false;
  if (plan.status === "building") return !agentBusy;
  return plan.status === "draft" || plan.status === "approved";
}

export function buildPromptForPlan(plan: PlanDocument): string {
  const todos = plan.todos
    .map((todo, index) => `${index + 1}. [${todo.id}] ${todo.content}`)
    .join("\n");
  const body = plan.body.trim() || "(empty plan body)";
  return [
    `Build the approved plan "${plan.name}" at ${plan.path}.`,
    plan.overview ? `Overview: ${plan.overview}` : null,
    "",
    "First action: load_skill executing-plans. Do not skip it.",
    "Then load_skill test-driven-development before writing implementation code.",
    "Then load_skill using-git-worktrees. If git_status is dirty, git_commit then git_push if origin exists, then git_branch create in the open checkout before mutating files. Do not create .worktrees/. Do not stash.",
    "Do not end the turn while plan todos remain pending or in_progress. After completing a todo, start the next one immediately.",
    "When every todo is complete, load_skill verification-before-completion before finish_development_branch.",
    "",
    "Rules:",
    "1. Follow the plan body below. Read extra files only as the current todo requires.",
    "2. Implement the todos in order, one at a time. Do not skip any todo.",
    "3. Before starting a todo, call update_plan_todo with status in_progress. After finishing it, call update_plan_todo with status completed.",
    "4. Verify each todo as the plan describes before marking it completed.",
    "",
    "Plan:",
    body,
    "",
    "Todos:",
    todos,
  ].filter((line) => line !== null).join("\n");
}

export async function buildPlan(
  planId: string,
  deps: BuildPlanDeps = {},
): Promise<{ ok: true } | { ok: false; message: string }> {
  const store = usePlanStore.getState();
  const plan = store.plans[planId];
  if (!plan) return { ok: false, message: "Plan not found." };
  if (plan.todos.length === 0) return { ok: false, message: "Plan has no todos." };
  const runtime = deps.runtime ?? agentRuntime;
  if (plan.status === "building" && runtime.isBusy()) {
    return { ok: false, message: "Build already running." };
  }

  store.approve(planId);
  store.markBuilding(planId);
  try {
    await store.savePlan(planId);
  } catch {
    // File persistence is best-effort here; the store is the source of truth for the UI.
  }

  runtime.workflowSession.planPath = plan.path;
  if (!runtime.workflowSession.designApproved) {
    runtime.workflowSession.approveDesign(`Build plan: ${plan.name}`, plan.path);
  }
  runtime.workflowSession.approvePlan();
  runtime.publish({ type: "plan-build-started", planId: plan.id, path: plan.path });
  runtime.setInteractionMode("agent");
  await runtime.sendMessage(buildPromptForPlan(plan));
  return { ok: true };
}

/** Latest plan that can be built (draft, approved, or a stale building lock). Used by the composer shortcut. */
export function latestBuildablePlanId(agentBusy = false): string | null {
  const state = usePlanStore.getState();
  const plans = Object.values(state.plans);
  if (plans.length === 0) return null;
  if (state.activePlanId) {
    const active = state.plans[state.activePlanId];
    if (isPlanBuildable(active, agentBusy)) return active.id;
  }
  const sorted = [...plans].sort((a, b) => b.updatedAt - a.updatedAt);
  const candidate = sorted.find((plan) => isPlanBuildable(plan, agentBusy));
  return candidate?.id ?? null;
}
