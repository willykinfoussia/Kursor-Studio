import { beforeEach, describe, expect, it, vi } from "vitest";
import { WorkflowSessionState } from "../../workflow/sessionState";
import { usePlanStore, writablePlanPath } from "../../../../stores/planStore";
import { buildPlan, buildPromptForPlan, isBuildPlanPrompt, isPlanBuildable, latestBuildablePlanId } from "../buildPlan";
import { createPlanDocument } from "../planFile";

function seedPlan(status: "draft" | "approved" | "building" | "done" = "draft") {
  const plan = createPlanDocument({ name: "Demo", overview: "Ship it", body: "## Steps", todos: ["Do A", "Do B"] });
  plan.status = status;
  usePlanStore.setState({ plans: { [plan.id]: plan }, activePlanId: plan.id, dockDismissed: false });
  return plan;
}

function mockRuntime(busy = false) {
  return {
    workflowSession: new WorkflowSessionState(),
    publish: vi.fn(),
    setInteractionMode: vi.fn(),
    sendMessage: vi.fn(async () => undefined),
    isBusy: () => busy,
  };
}

beforeEach(() => {
  usePlanStore.getState().reset();
});

describe("buildPlan", () => {
  it("approves the plan, switches to agent, and sends an implementation prompt", async () => {
    const plan = seedPlan();
    const runtime = mockRuntime();
    const result = await buildPlan(plan.id, { runtime });
    expect(result).toEqual({ ok: true });
    expect(runtime.workflowSession.planApproved).toBe(true);
    expect(runtime.workflowSession.designApproved).toBeTruthy();
    expect(runtime.workflowSession.planPath).toBe(plan.path);
    expect(runtime.setInteractionMode).toHaveBeenCalledWith("agent");
    expect(runtime.publish).toHaveBeenCalledWith({ type: "plan-build-started", planId: plan.id, path: plan.path });
    expect(runtime.sendMessage).toHaveBeenCalledOnce();
    const prompt = String(runtime.sendMessage.mock.calls[0]?.[0] ?? "");
    expect(prompt).toContain(plan.path);
    expect(prompt).toContain("update_plan_todo");
    expect(prompt).toContain("todo-1");
    expect(prompt).toContain("## Steps");
    expect(prompt).toContain("executing-plans");
    expect(prompt).toMatch(/Do not end the turn while plan todos remain pending/i);
    expect(usePlanStore.getState().plans[plan.id]?.status).toBe("building");
    expect(usePlanStore.getState().dockDismissed).toBe(false);
    expect(usePlanStore.getState().dockConversationId).toBeTruthy();
  });

  it("refuses unknown plans, empty todos, and concurrent builds", async () => {
    expect(await buildPlan("missing", { runtime: mockRuntime() })).toEqual({ ok: false, message: "Plan not found." });
    const empty = createPlanDocument({ name: "Empty", overview: "", body: "", todos: [] });
    usePlanStore.getState().upsertPlan(empty);
    expect(await buildPlan(empty.id, { runtime: mockRuntime() })).toEqual({ ok: false, message: "Plan has no todos." });
    const building = seedPlan("building");
    expect(await buildPlan(building.id, { runtime: mockRuntime(true) })).toEqual({ ok: false, message: "Build already running." });
  });

  it("rebuilds a stale building plan when the agent is idle", async () => {
    const plan = seedPlan("building");
    const runtime = mockRuntime(false);
    expect(await buildPlan(plan.id, { runtime })).toEqual({ ok: true });
    expect(runtime.workflowSession.planApproved).toBe(true);
    expect(runtime.sendMessage).toHaveBeenCalledOnce();
  });

  it("finds the latest buildable plan", () => {
    expect(latestBuildablePlanId()).toBeNull();
    const done = seedPlan("done");
    expect(latestBuildablePlanId()).toBeNull();
    const draft = createPlanDocument({ name: "Fresh", overview: "", body: "", todos: ["x"] });
    usePlanStore.getState().upsertPlan(draft);
    expect(latestBuildablePlanId()).toBe(draft.id);
    expect(done.id).toBeTruthy();
  });

  it("treats a stale building plan as buildable when the agent is idle", () => {
    const plan = seedPlan("building");
    expect(isPlanBuildable(plan, false)).toBe(true);
    expect(isPlanBuildable(plan, true)).toBe(false);
    expect(latestBuildablePlanId(false)).toBe(plan.id);
    expect(latestBuildablePlanId(true)).toBeNull();
  });

  it("releases a stuck building plan back to approved", () => {
    const plan = seedPlan("building");
    usePlanStore.getState().releaseBuilding();
    expect(usePlanStore.getState().plans[plan.id]?.status).toBe("approved");
  });

  it("hydrates a writable plan path without approving", () => {
    const plan = seedPlan("draft");
    expect(writablePlanPath(usePlanStore.getState())).toBe(plan.path);
    plan.status = "done";
    usePlanStore.setState({ plans: { [plan.id]: plan } });
    expect(writablePlanPath(usePlanStore.getState())).toBeNull();
  });

  it("builds a prompt that names every todo id", () => {
    const plan = createPlanDocument({ name: "Demo", overview: "Why", body: "", todos: ["First", "Second"] });
    const prompt = buildPromptForPlan(plan);
    expect(prompt).toContain('[todo-1] First');
    expect(prompt).toContain('[todo-2] Second');
    expect(prompt).toContain("in_progress");
    expect(prompt).toContain("executing-plans");
    expect(prompt).toContain("git_branch");
    expect(prompt).toMatch(/git_commit then git_push/);
    expect(prompt).toMatch(/Do not stash/);
    expect(prompt).toMatch(/Do not create \.worktrees\//);
    expect(prompt).toMatch(/remain pending/);
    expect(prompt).toContain("(empty plan body)");
    expect(isBuildPlanPrompt(prompt)).toBe(true);
  });
});
