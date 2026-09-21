import { beforeEach, describe, expect, it } from "vitest";
import { applyPlanTodoProgress, planProgressPercent } from "../applyPlanTodoProgress";
import { createPlanDocument } from "../planFile";
import { planProgress } from "../types";
import { usePlanStore } from "../../../../stores/planStore";
import { useAgentStore } from "../../../../stores/agentStore";

beforeEach(() => {
  usePlanStore.getState().reset();
  useAgentStore.setState({ runTask: { id: "run", title: "Build", status: "running", progress: 0 } });
});

describe("applyPlanTodoProgress", () => {
  it("patches the plan store and sticky task percent from done/total", () => {
    const plan = createPlanDocument({ name: "Demo", overview: "", body: "", todos: ["A", "B", "C", "D"] });
    plan.todos[0]!.status = "completed";
    plan.status = "building";
    usePlanStore.getState().upsertPlan(plan);

    applyPlanTodoProgress({ planId: plan.id, todoId: "todo-2", status: "completed", done: 2, total: 4 });

    expect(planProgress(usePlanStore.getState().plans[plan.id]).done).toBe(2);
    expect(useAgentStore.getState().runTask?.progress).toBe(50);
    expect(planProgressPercent(1, 8)).toBe(13);
    expect(planProgressPercent(8, 8)).toBe(100);
  });
});
