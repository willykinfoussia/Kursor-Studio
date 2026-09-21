import { beforeEach, describe, expect, it } from "vitest";
import { usePlanStore } from "../../../../stores/planStore";
import { WorkflowSessionState } from "../../workflow/sessionState";
import { createPlanDocument } from "../planFile";
import { bindContinuingProjectPlan, restoreSessionFromPlan } from "../bindProjectPlan";

beforeEach(() => {
  usePlanStore.getState().reset();
});

describe("bindContinuingProjectPlan", () => {
  it("binds a done project plan on finalize and restores approvals", () => {
    const plan = createPlanDocument({ name: "Fitness", overview: "", body: "", todos: ["Verify"] });
    plan.status = "done";
    plan.todos[0]!.status = "completed";
    usePlanStore.getState().upsertPlan(plan);
    const session = new WorkflowSessionState();
    const bound = bindContinuingProjectPlan(session, "finalise l'implémentation de l'application de sport");
    expect(bound?.path).toBe(plan.path);
    expect(session.planPath).toBe(plan.path);
    expect(session.planApproved).toBe(true);
    expect(session.designApproved).toBeTruthy();
    expect(session.planTodosComplete).toBe(true);
    expect(session.interactionMode).toBe("agent");
  });

  it("does not bind a previous plan on a new feature request", () => {
    const plan = createPlanDocument({ name: "Fitness", overview: "", body: "", todos: ["Verify"] });
    plan.status = "building";
    usePlanStore.getState().upsertPlan(plan);
    const session = new WorkflowSessionState();
    expect(bindContinuingProjectPlan(session, "ajoute une page settings")).toBeNull();
    expect(session.planPath).toBeNull();
    expect(session.planApproved).toBe(false);
  });

  it("binds a draft path without approving", () => {
    const plan = createPlanDocument({ name: "Draft", overview: "", body: "", todos: ["A"] });
    usePlanStore.getState().upsertPlan(plan);
    const session = new WorkflowSessionState();
    restoreSessionFromPlan(session, plan);
    expect(session.planPath).toBe(plan.path);
    expect(session.planApproved).toBe(false);
    expect(session.designApproved).toBeNull();
  });
});
