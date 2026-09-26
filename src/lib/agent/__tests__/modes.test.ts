import { beforeEach, describe, expect, it } from "vitest";
import { createPlanDocument } from "../plans/planFile";
import { WorkflowSessionState } from "../workflow/sessionState";
import {
  cycleInteractionMode,
  isReadOnlyInteraction,
  migrateInteractionMode,
  modeSystemOverlay,
  planToAgentBlocked,
} from "../modes";
import { usePlanStore } from "../../../stores/planStore";

beforeEach(() => {
  usePlanStore.getState().reset();
});

describe("interaction modes", () => {
  it("cycles Agent → Plan → Debug → Ask → Agent", () => {
    expect(cycleInteractionMode("agent")).toBe("plan");
    expect(cycleInteractionMode("plan")).toBe("debug");
    expect(cycleInteractionMode("debug")).toBe("ask");
    expect(cycleInteractionMode("ask")).toBe("agent");
  });

  it("treats Plan and Ask as read-only", () => {
    expect(isReadOnlyInteraction({ interactionMode: "plan" })).toBe(true);
    expect(isReadOnlyInteraction({ interactionMode: "ask" })).toBe(true);
    expect(isReadOnlyInteraction({ planMode: true })).toBe(true);
    expect(isReadOnlyInteraction({ interactionMode: "agent" })).toBe(false);
    expect(isReadOnlyInteraction({ interactionMode: "debug" })).toBe(false);
  });

  it("injects overlays for Plan, Ask, and Debug", () => {
    expect(modeSystemOverlay("agent")).toBe("");
    expect(modeSystemOverlay("plan")).toMatch(/read-only/i);
    expect(modeSystemOverlay("plan")).toMatch(/press Build/);
    expect(modeSystemOverlay("plan")).not.toMatch(/switch to Agent mode to implement/);
    expect(modeSystemOverlay("ask")).toMatch(/read-only/i);
    expect(modeSystemOverlay("debug")).toMatch(/systematic-debugging/);
  });

  it("keeps Agent on brainstorming until the design is approved", () => {
    const overlay = modeSystemOverlay("agent", { goalKind: "build", designApproved: null });
    expect(overlay).toMatch(/brainstorming/i);
    expect(overlay).toMatch(/at least two explore/i);
    expect(overlay).toMatch(/yes\/oui/);
    expect(overlay).not.toMatch(/Call create_plan now/i);
  });

  it("tells Agent not to implement a disk-approved plan without session planApproved", () => {
    const plan = createPlanDocument({ name: "Old Next", overview: "", body: "", todos: ["a"] });
    plan.status = "approved";
    usePlanStore.getState().upsertPlan(plan);
    const overlay = modeSystemOverlay("agent", { goalKind: "build", designApproved: null, planApproved: false });
    expect(overlay).toMatch(/has not approved a plan/i);
    expect(overlay).toMatch(/not created in this conversation/i);
    expect(overlay).toMatch(/Do not load_skill executing-plans/i);
    expect(overlay).toMatch(/brainstorming/i);
    expect(overlay).not.toMatch(/The plan is approved\. You MUST call load_skill executing-plans/i);
    expect(overlay).not.toMatch(/git_branch create before any source mutation/i);
  });

  it("tells Plan mode to wait for chat yes before create_plan", () => {
    const overlay = modeSystemOverlay("plan", { goalKind: "build", designApproved: null });
    expect(overlay).toMatch(/Do not call create_plan until/i);
    expect(overlay).not.toMatch(/Call create_plan now/i);
  });

  it("tells Plan mode to write the plan from the agreed design", () => {
    const overlay = modeSystemOverlay("plan", {
      goalKind: "build",
      designApproved: { scope: "x", at: 1 },
      planPath: null,
    });
    expect(overlay).toMatch(/Do not reload brainstorming/i);
    expect(overlay).toMatch(/MUST call load_skill with skill writing-plans/i);
    expect(overlay).toMatch(/subagent-driven-planning/i);
    expect(overlay).toMatch(/at least two explore/i);
    expect(overlay).toMatch(/create_plan now using the agreed design/i);
    expect(overlay).toMatch(/section per todo/i);
    expect(overlay).toMatch(/Outline-only/i);
    expect(overlay).toMatch(/6000/);
    expect(overlay).toMatch(/Problem/);
    expect(overlay).toMatch(/KEEP\/EXTEND/);
    expect(overlay).not.toMatch(/shows the code to write/i);
    expect(overlay).toMatch(/Do not tell the user to click Build/i);
    expect(overlay).toMatch(/If create_plan returns success false/i);
    expect(overlay).not.toMatch(/press Build/);
  });

  it("tells Plan mode to call create_plan without more explores once research is done", () => {
    const overlay = modeSystemOverlay("plan", {
      goalKind: "build",
      designApproved: { scope: "x", at: 1 },
      planPath: null,
      planExploreDone: true,
    });
    expect(overlay).toMatch(/explore research is already done/i);
    expect(overlay).toMatch(/Do not dispatch more explore subagents/i);
    expect(overlay).toMatch(/create_plan now using the agreed design/i);
    expect(overlay).toMatch(/Do not end the turn without create_plan/i);
    expect(overlay).not.toMatch(/at least two explore/i);
    expect(overlay).not.toMatch(/Do not call create_plan yet/i);
  });

  it("writes a new plan after design yes even when a foreign disk plan is approved", () => {
    const plan = createPlanDocument({ name: "Old Next", overview: "", body: "", todos: ["a"] });
    plan.status = "approved";
    usePlanStore.getState().upsertPlan(plan);
    const overlay = modeSystemOverlay("plan", {
      goalKind: "build",
      designApproved: { scope: "oui", at: 1 },
      planPath: null,
      planApproved: false,
    });
    expect(overlay).toMatch(/not created in this conversation/i);
    expect(overlay).toMatch(/Do not load_skill executing-plans/i);
    expect(overlay).toMatch(/create_plan now using the agreed design/i);
    expect(overlay).not.toMatch(/already written/i);
    expect(overlay).not.toMatch(/The plan is approved\. You MUST call load_skill executing-plans/i);
  });

  it("injects approved design notes and brief into Plan overlay", () => {
    const overlay = modeSystemOverlay("plan", {
      goalKind: "build",
      designApproved: { scope: "oui", at: 1 },
      planPath: null,
      designNotes: ["Workout Tracker", "React + TypeScript + Tailwind + localStorage"],
      designBrief: "A client-only workout tracker using React, Tailwind, and localStorage.",
    });
    expect(overlay).toMatch(/Approved design choices/);
    expect(overlay).toMatch(/Workout Tracker/);
    expect(overlay).toMatch(/localStorage/);
    expect(overlay).toMatch(/Approved design brief/);
    expect(overlay).toMatch(/client-only workout tracker/);
  });

  it("tells Agent mode to follow executing-plans after Build", () => {
    const overlay = modeSystemOverlay("agent", {
      goalKind: "build",
      designApproved: { scope: "x", at: 1 },
      planApproved: true,
    });
    expect(overlay).toMatch(/load_skill executing-plans/i);
    expect(overlay).toMatch(/test-driven-development/i);
    expect(overlay).not.toMatch(/subagent-driven-development/i);
    expect(overlay).toMatch(/using-git-worktrees/i);
    expect(overlay).toMatch(/git_status/);
    expect(overlay).toMatch(/git_commit/);
    expect(overlay).toMatch(/git_push/);
    expect(overlay).toMatch(/git_branch/i);
    expect(overlay).toMatch(/Do not stash/);
    expect(overlay).toMatch(/using-kursor-shell/i);
    expect(overlay).toMatch(/in_progress/i);
    expect(overlay).toMatch(/Do not end the turn while plan todos remain pending or in_progress/i);
    expect(overlay).toMatch(/After completing a todo, start the next one immediately/i);
  });

  it("tells Agent mode to verify when the bound plan is complete", () => {
    const overlay = modeSystemOverlay("agent", {
      goalKind: "build",
      planApproved: true,
      planTodosComplete: true,
      planPath: ".kursor/plans/fitness.plan.md",
    });
    expect(overlay).toMatch(/verification-before-completion/i);
    expect(overlay).toMatch(/Do not brainstorm/i);
    expect(overlay).toMatch(/Do not call create_plan/i);
    expect(overlay).toMatch(/finishing-a-development-branch/i);
    expect(overlay).toMatch(/finish_development_branch/i);
    expect(overlay).toMatch(/using-kursor-shell/i);
    expect(overlay).not.toMatch(/then stop/i);
    expect(overlay).not.toMatch(/executing-plans/i);
  });

  it("tells Plan mode to press Build once the plan file exists", () => {
    const overlay = modeSystemOverlay("plan", {
      goalKind: "build",
      designApproved: { scope: "x", at: 1 },
      planPath: ".kursor/plans/demo.plan.md",
    });
    expect(overlay).toMatch(/already written/i);
    expect(overlay).toMatch(/press Build/);
    expect(overlay).not.toMatch(/Call create_plan now/i);
  });

  it("migrates legacy planMode snapshots to Plan", () => {
    expect(migrateInteractionMode({ planMode: true })).toBe("plan");
    expect(migrateInteractionMode({ interactionMode: "ask" })).toBe("ask");
    expect(migrateInteractionMode({})).toBe("agent");
  });

  it("restores old snapshots that only had planMode", () => {
    const next = new WorkflowSessionState();
    next.restore({
      skipProcess: false,
      designApproved: null,
      planApproved: false,
      planPath: null,
      planMode: true,
      agentBranch: null,
      criticalReviewOpen: false,
      lastUserPrompt: "",
      goalKind: "build",
      invokedSkillIds: [],
      sddEnabled: true,
      sddRound: 0,
    });
    expect(next.interactionMode).toBe("plan");
    expect(next.planMode).toBe(true);
    expect(next.snapshot().interactionMode).toBe("plan");
    next.setActiveTodo("todo-2");
    const snap = next.snapshot();
    const restored = new WorkflowSessionState();
    restored.restore(snap);
    expect(restored.activeTodoId).toBe("todo-2");
  });

  it("restores a legacy worktree snapshot as agentBranch", () => {
    const next = new WorkflowSessionState();
    next.restore({
      skipProcess: false,
      designApproved: null,
      planApproved: true,
      planPath: ".kursor/plans/demo.plan.md",
      planMode: false,
      worktree: { path: ".worktrees/kursor-feat", branch: "kursor-feat" },
      criticalReviewOpen: false,
      lastUserPrompt: "",
      goalKind: "build",
      invokedSkillIds: [],
      sddEnabled: true,
      sddRound: 0,
    });
    expect(next.agentBranch).toEqual({ name: "kursor-feat", base: "main" });
    expect(next.snapshot().agentBranch).toEqual({ name: "kursor-feat", base: "main" });
    expect(next.snapshot()).not.toHaveProperty("worktree");
  });

  it("snapshots and restores designNotes and designBrief", () => {
    const next = new WorkflowSessionState();
    next.recordDesignChoice("Workout Tracker");
    next.recordDesignChoice("oui");
    next.recordDesignChoice("Oui, j'approuve");
    next.recordDesignChoice("Non, je veux changer quelque chose");
    next.recordDesignChoice("Web — React + TypeScript + Vite");
    next.recordDesignChoice("Core — Workouts + Historique simple");
    next.setDesignBrief("React + localStorage workout app.");
    const snap = next.snapshot();
    expect(snap.designNotes).toEqual([
      "Workout Tracker",
      "React + TypeScript + Vite",
      "Workouts + Historique simple",
    ]);
    expect(snap.designBrief).toMatch(/localStorage/);
    const restored = new WorkflowSessionState();
    restored.restore(snap);
    expect(restored.designNotes).toEqual([
      "Workout Tracker",
      "React + TypeScript + Vite",
      "Workouts + Historique simple",
    ]);
    expect(restored.designBrief).toMatch(/localStorage/);
  });

  it("forces explain in Ask and bug in Debug on each user turn", () => {
    const ask = new WorkflowSessionState();
    ask.setInteractionMode("ask");
    ask.beginUserTurn("add a filter button");
    expect(ask.goalKind).toBe("explain");

    const debug = new WorkflowSessionState();
    debug.setInteractionMode("debug");
    debug.beginUserTurn("explain this file");
    expect(debug.goalKind).toBe("bug");
  });

  it("blocks Plan to Agent until the plan is approved", () => {
    const next = new WorkflowSessionState();
    next.setInteractionMode("plan");
    expect(planToAgentBlocked(next, "agent")).toMatch(/Build/);
    next.approvePlan();
    expect(planToAgentBlocked(next, "agent")).toBeNull();
  });
});
