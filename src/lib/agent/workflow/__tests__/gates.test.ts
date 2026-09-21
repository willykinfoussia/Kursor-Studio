import { describe, expect, it, beforeEach } from "vitest";
import { usePlanStore } from "../../../../stores/planStore";
import { createPlanDocument } from "../../plans/planFile";
import { WorkflowSessionState, shouldCloseImplementationCycle } from "../sessionState";
import {
  evaluateWorkflowGate,
  LOAD_EXECUTING_PLANS_REASON,
  LOAD_KURSOR_SHELL_REASON,
  LOAD_TDD_REASON,
  LOAD_VERIFICATION_REASON,
  LOAD_WRITING_PLANS_REASON,
  LOAD_BRAINSTORM_RESEARCH_REASON,
  LOAD_PLAN_RESEARCH_REASON,
  BRAINSTORM_EXPLORE_REASON,
  PLAN_EXPLORE_REASON,
  RELOAD_BRAINSTORMING_REASON,
  TODO_IN_PROGRESS_REASON,
  WAIT_FOR_BUILD_REASON,
  WAIT_FOR_AGENT_BRANCH_REASON,
} from "../gates";

function session(partial: Partial<WorkflowSessionState> = {}) {
  const next = new WorkflowSessionState();
  Object.assign(next, partial);
  return next;
}

beforeEach(() => {
  usePlanStore.getState().reset();
});

describe("1% skill check", () => {
  it("denies read_file until a skill check on the parent turn", () => {
    const gate = evaluateWorkflowGate("read_file", { path: "src/a.ts" }, false, session({ goalKind: "explain" }));
    expect(gate).toEqual({ decision: "deny", reason: "invoke a skill first (1% rule)" });
  });

  it("allows load_skill, check_skills, and ask_user_question before the check", () => {
    const idle = session();
    expect(evaluateWorkflowGate("load_skill", { skill: "brainstorming" }, false, idle).decision).toBe("allow");
    expect(evaluateWorkflowGate("check_skills", { noneApply: true }, false, idle).decision).toBe("allow");
    expect(evaluateWorkflowGate("ask_user_question", { prompt: "ok?" }, false, idle).decision).toBe("allow");
  });

  it("allows mode switches without a prior skill check", () => {
    const idle = session();
    expect(evaluateWorkflowGate("switch_agent_mode", { mode: "agent" }, false, idle).decision).toBe("allow");
    expect(evaluateWorkflowGate("enter_plan_mode", { enabled: true }, false, idle).decision).toBe("allow");
  });

  it("skips the 1% filet for subagents", () => {
    const gate = evaluateWorkflowGate("read_file", { path: "src/a.ts" }, false, session({ subagent: true }));
    expect(gate.decision).toBe("allow");
  });

  it("skips the 1% filet after a skill was loaded this session", () => {
    const gate = evaluateWorkflowGate(
      "read_file",
      { path: "src/a.ts" },
      false,
      session({ invokedSkillIds: ["brainstorming"] }),
    );
    expect(gate.decision).toBe("allow");
  });

  it("keeps the skill check on oui even if the previous turn reset the flag", () => {
    const next = session({
      skillCheckThisTurn: false,
      goalKind: "build",
      invokedSkillIds: ["brainstorming"],
    });
    next.beginUserTurn("oui");
    expect(next.skillCheckThisTurn).toBe(true);
    expect(next.interactionMode).toBe("plan");
    expect(evaluateWorkflowGate("read_file", { path: "src/a.ts" }, false, next).decision).toBe("allow");
  });
});

describe("HARD-GATE", () => {
  it("denies mutations on a build prompt without designApproved", () => {
    const gate = evaluateWorkflowGate(
      "write_file",
      { path: "src/a.ts" },
      true,
      session({ skillCheckThisTurn: true, goalKind: "build" }),
    );
    expect(gate.decision).toBe("deny");
    if (gate.decision === "deny") expect(gate.reason).toMatch(/HARD-GATE/);
  });

  it("still blocks mutations after design approval until Build", () => {
    const next = session({ skillCheckThisTurn: true, goalKind: "build" });
    next.approveDesign("Add a filter");
    expect(next.interactionMode).toBe("plan");
    expect(evaluateWorkflowGate("write_file", { path: "src/a.ts" }, true, next).decision).toBe("deny");
    next.approvePlan();
    next.setInteractionMode("agent");
    expect(evaluateWorkflowGate("write_file", { path: "src/a.ts" }, true, next)).toEqual({
      decision: "deny",
      reason: LOAD_EXECUTING_PLANS_REASON,
    });
    next.markSkillCheck("executing-plans");
    next.markSkillCheck("test-driven-development");
    next.setActiveTodo("todo-1");
    next.agentBranch = { name: "kursor-x", base: "main" };
    expect(evaluateWorkflowGate("write_file", { path: "src/a.ts" }, true, next).decision).toBe("allow");
  });

  it("does not unlock writes after a French chat yes; Build is required", () => {
    const next = session({
      skillCheckThisTurn: true,
      goalKind: "build",
      invokedSkillIds: ["brainstorming"],
    });
    const result = next.beginUserTurn("oui je valide");
    expect(result.designApproved).toBe(true);
    expect(result.planApproved).toBe(false);
    expect(next.designApproved).toBeTruthy();
    expect(next.goalKind).toBe("build");
    expect(next.planApproved).toBe(false);
    expect(next.interactionMode).toBe("plan");
    expect(next.skillCheckThisTurn).toBe(true);
    const write = evaluateWorkflowGate("write_file", { path: "src/a.ts" }, true, next);
    expect(write.decision).toBe("deny");
    const run = evaluateWorkflowGate("run_command", { command: "npx create-next-app" }, true, next);
    expect(run.decision).toBe("deny");
  });

  it("stays in Agent on a build prompt until the design is approved", () => {
    const next = new WorkflowSessionState();
    next.beginUserTurn("Crée une application tinder");
    expect(next.goalKind).toBe("build");
    expect(next.interactionMode).toBe("agent");
    expect(next.planMode).toBe(false);
    next.approveDesign("stack");
    expect(next.interactionMode).toBe("plan");
    expect(next.planMode).toBe(true);
  });

  it("does not auto-enter Plan when skipProcess is set", () => {
    const next = new WorkflowSessionState();
    next.skipProcess = true;
    next.beginUserTurn("create src/util.ts");
    expect(next.goalKind).toBe("build");
    expect(next.interactionMode).toBe("agent");
    next.approveDesign("eval");
    next.markSkillCheck();
    expect(evaluateWorkflowGate("write_file", { path: "src/util.ts" }, true, next).decision).toBe("allow");
  });

  it("keeps explain prompts read-only even after a skill check", () => {
    const gate = evaluateWorkflowGate(
      "apply_patch",
      { path: "src/a.ts" },
      true,
      session({ skillCheckThisTurn: true, goalKind: "explain" }),
    );
    expect(gate.decision).toBe("deny");
  });

  it("blocks create_plan during brainstorming without designApproved", () => {
    const next = session({
      skillCheckThisTurn: true,
      goalKind: "build",
      invokedSkillIds: ["brainstorming"],
    });
    const create = evaluateWorkflowGate("create_plan", { name: "x", todos: ["a"] }, true, next);
    expect(create.decision).toBe("deny");
    if (create.decision === "deny") expect(create.reason).toMatch(/HARD-GATE/);
    const update = evaluateWorkflowGate("update_plan_todo", { todo_id: "todo-1", status: "in_progress" }, true, next);
    expect(update.decision).toBe("deny");
    const write = evaluateWorkflowGate("write_file", { path: "src/a.ts" }, true, next);
    expect(write.decision).toBe("deny");
    if (write.decision === "deny") expect(write.reason).toMatch(/HARD-GATE/);
  });

  it("blocks code mutations until Build when a plan file exists", () => {
    const next = session({
      skillCheckThisTurn: true,
      goalKind: "build",
      designApproved: { scope: "x", at: 1 },
      planPath: ".kursor/plans/demo.plan.md",
    });
    expect(evaluateWorkflowGate("update_plan_todo", { todo_id: "todo-1", status: "in_progress" }, true, next).decision).toBe("allow");
    const write = evaluateWorkflowGate("write_file", { path: "src/a.ts" }, true, next);
    expect(write).toEqual({ decision: "deny", reason: WAIT_FOR_BUILD_REASON });
    next.approvePlan();
    expect(evaluateWorkflowGate("write_file", { path: "src/a.ts" }, true, next)).toEqual({
      decision: "deny",
      reason: LOAD_EXECUTING_PLANS_REASON,
    });
    next.markSkillCheck("executing-plans");
    next.markSkillCheck("test-driven-development");
    next.setActiveTodo("todo-1");
    next.agentBranch = { name: "kursor-x", base: "main" };
    expect(evaluateWorkflowGate("write_file", { path: "src/a.ts" }, true, next).decision).toBe("allow");
  });

  it("requires systematic-debugging before patching a bug", () => {
    const gate = evaluateWorkflowGate(
      "write_file",
      { path: "src/a.ts" },
      true,
      session({ skillCheckThisTurn: true, goalKind: "bug" }),
    );
    expect(gate.decision).toBe("deny");
  });
});

describe("plan mode and executing-plans", () => {
  it("blocks mutating tools in plan mode", () => {
    const gate = evaluateWorkflowGate(
      "write_file",
      { path: "src/a.ts" },
      true,
      session({ skillCheckThisTurn: true, planMode: true, designApproved: { scope: "x", at: 1 } }),
    );
    expect(gate.decision).toBe("deny");
    expect(evaluateWorkflowGate(
      "git_branch",
      { action: "create" },
      true,
      session({
        skillCheckThisTurn: true,
        planMode: true,
        interactionMode: "plan",
        designApproved: { scope: "x", at: 1 },
      }),
    ).decision).toBe("deny");
  });

  it("denies write_file to plan documents in plan mode (create_plan only)", () => {
    const gate = evaluateWorkflowGate(
      "write_file",
      { path: ".kursor/plans/demo.plan.md" },
      true,
      session({ skillCheckThisTurn: true, planMode: true, designApproved: { scope: "x", at: 1 } }),
    );
    expect(gate.decision).toBe("deny");
  });

  it("allows create_plan and update_plan_todo in plan mode after design approval", () => {
    const planSession = session({
      skillCheckThisTurn: true,
      planMode: true,
      interactionMode: "plan",
      goalKind: "build",
      designApproved: { scope: "x", at: 1 },
      invokedSkillIds: ["writing-plans", "subagent-driven-planning"],
      planExploreDone: true,
    });
    expect(evaluateWorkflowGate("create_plan", { name: "x", todos: ["a"] }, true, planSession).decision).toBe("allow");
    expect(evaluateWorkflowGate("update_plan_todo", { todo_id: "todo-1", status: "completed" }, true, planSession).decision).toBe("allow");
  });

  it("does not approve the design on ok or d'accord", () => {
    const next = session({
      skillCheckThisTurn: true,
      goalKind: "build",
      invokedSkillIds: ["brainstorming"],
    });
    expect(next.beginUserTurn("ok").designApproved).toBe(false);
    expect(next.designApproved).toBeNull();
    expect(next.interactionMode).toBe("agent");
    expect(next.beginUserTurn("d'accord").designApproved).toBe(false);
    expect(next.beginUserTurn("oui").designApproved).toBe(true);
    expect(next.interactionMode).toBe("plan");
  });

  it("approves the design on Oui, c'est bon", () => {
    const next = session({
      skillCheckThisTurn: true,
      goalKind: "build",
      invokedSkillIds: ["brainstorming"],
    });
    expect(next.beginUserTurn("Oui, c'est bon").designApproved).toBe(true);
    expect(next.designApproved).toBeTruthy();
    expect(next.interactionMode).toBe("plan");
  });

  it("keeps build and drafts approved plans when the user rejects the design", () => {
    const plan = createPlanDocument({ name: "Old Next", overview: "", body: "", todos: ["a"] });
    plan.status = "approved";
    usePlanStore.getState().upsertPlan(plan);
    const next = session({
      skillCheckThisTurn: true,
      goalKind: "build",
      invokedSkillIds: ["brainstorming"],
      designApproved: { scope: "x", at: 1 },
      planApproved: true,
      planPath: plan.path,
    });
    next.setInteractionMode("plan");
    next.beginUserTurn("non je veux une application local");
    expect(next.goalKind).toBe("build");
    expect(next.designApproved).toBeNull();
    expect(next.planApproved).toBe(false);
    expect(next.planPath).toBeNull();
    expect(next.interactionMode).toBe("agent");
    expect(usePlanStore.getState().plans[plan.id]?.status).toBe("draft");
    const commit = evaluateWorkflowGate("git_commit", { message: "wip" }, true, next);
    expect(commit.decision).toBe("deny");
    if (commit.decision === "deny") expect(commit.reason).toMatch(/HARD-GATE/);
  });

  it("denies reloading brainstorming after design approval", () => {
    const next = session({
      skillCheckThisTurn: true,
      goalKind: "build",
      designApproved: { scope: "x", at: 1 },
    });
    expect(evaluateWorkflowGate("load_skill", { skill: "brainstorming" }, false, next)).toEqual({
      decision: "deny",
      reason: RELOAD_BRAINSTORMING_REASON,
    });
    expect(evaluateWorkflowGate("load_skill", { skill: "superpowers:brainstorming" }, false, next)).toEqual({
      decision: "deny",
      reason: RELOAD_BRAINSTORMING_REASON,
    });
    expect(evaluateWorkflowGate("load_skill", { skill: "writing-plans" }, false, next).decision).toBe("allow");
  });

  it("denies brainstorming when a project plan is already bound", () => {
    const next = session({
      skillCheckThisTurn: true,
      goalKind: "build",
      planApproved: true,
      planPath: ".kursor/plans/fitness.plan.md",
    });
    expect(evaluateWorkflowGate("load_skill", { skill: "brainstorming" }, false, next)).toEqual({
      decision: "deny",
      reason: RELOAD_BRAINSTORMING_REASON,
    });
  });

  it("allows brainstorming after the bound plan is complete", () => {
    const next = session({
      skillCheckThisTurn: true,
      goalKind: "build",
      designApproved: { scope: "x", at: 1 },
      planApproved: true,
      planPath: ".kursor/plans/fitness.plan.md",
      planTodosComplete: true,
    });
    expect(evaluateWorkflowGate("load_skill", { skill: "brainstorming" }, false, next).decision).toBe("allow");
  });

  it("allows brainstorming when a disk plan is approved without session approvals", () => {
    const plan = createPlanDocument({ name: "Fitness", overview: "", body: "", todos: ["Verify"] });
    plan.status = "approved";
    usePlanStore.getState().upsertPlan(plan);
    const next = session({
      skillCheckThisTurn: true,
      goalKind: "build",
    });
    expect(evaluateWorkflowGate("load_skill", { skill: "brainstorming" }, false, next).decision).toBe("allow");
    const commit = evaluateWorkflowGate("git_commit", { message: "wip" }, true, next);
    expect(commit.decision).toBe("deny");
    if (commit.decision === "deny") expect(commit.reason).toMatch(/HARD-GATE/);
  });

  it("allows brainstorming when a disk plan is done even without session approvals", () => {
    const plan = createPlanDocument({ name: "Fitness", overview: "", body: "", todos: ["Verify"] });
    plan.status = "done";
    usePlanStore.getState().upsertPlan(plan);
    const next = session({
      skillCheckThisTurn: true,
      goalKind: "build",
      planPath: plan.path,
    });
    expect(evaluateWorkflowGate("load_skill", { skill: "brainstorming" }, false, next).decision).toBe("allow");
  });

  it("allows verification mutations on a completed plan without executing-plans", () => {
    const next = session({
      skillCheckThisTurn: true,
      goalKind: "build",
      designApproved: { scope: "x", at: 1 },
      planApproved: true,
      planPath: ".kursor/plans/demo.plan.md",
      planTodosComplete: true,
      invokedSkillIds: ["verification-before-completion", "using-kursor-shell"],
      agentBranch: { name: "kursor-x", base: "main" },
    });
    next.setInteractionMode("agent");
    expect(evaluateWorkflowGate("write_file", { path: "src/a.ts" }, true, next).decision).toBe("allow");
  });

  it("denies create_plan until writing-plans is loaded", () => {
    const next = session({
      skillCheckThisTurn: true,
      planMode: true,
      interactionMode: "plan",
      goalKind: "build",
      designApproved: { scope: "x", at: 1 },
    });
    expect(evaluateWorkflowGate("create_plan", { name: "x", todos: ["a"] }, true, next)).toEqual({
      decision: "deny",
      reason: LOAD_WRITING_PLANS_REASON,
    });
    next.markSkillCheck("writing-plans");
    expect(evaluateWorkflowGate("create_plan", { name: "x", todos: ["a"] }, true, next)).toEqual({
      decision: "deny",
      reason: LOAD_PLAN_RESEARCH_REASON,
    });
    next.markSkillCheck("subagent-driven-planning");
    expect(evaluateWorkflowGate("create_plan", { name: "x", todos: ["a"] }, true, next)).toEqual({
      decision: "deny",
      reason: PLAN_EXPLORE_REASON,
    });
    next.noteExploreStarting();
    expect(evaluateWorkflowGate("create_plan", { name: "x", todos: ["a"] }, true, next)).toEqual({
      decision: "deny",
      reason: PLAN_EXPLORE_REASON,
    });
    next.noteExploreStarting();
    expect(evaluateWorkflowGate("create_plan", { name: "x", todos: ["a"] }, true, next).decision).toBe("allow");
  });

  it("allows create_plan after two explore starts in Plan without designApproved", () => {
    const next = session({
      skillCheckThisTurn: true,
      planMode: true,
      interactionMode: "plan",
      invokedSkillIds: ["writing-plans", "subagent-driven-planning"],
    });
    expect(next.designApproved).toBeNull();
    next.noteExploreStarting();
    expect(next.planExploreDone).toBe(false);
    next.noteExploreStarting();
    expect(next.planExploreDone).toBe(true);
    expect(evaluateWorkflowGate("create_plan", { name: "x", todos: ["a"] }, true, next).decision).toBe("allow");
  });

  it("denies Build mutations until executing-plans and an in_progress todo", () => {
    const next = session({
      skillCheckThisTurn: true,
      goalKind: "build",
      designApproved: { scope: "x", at: 1 },
      planApproved: true,
      planPath: ".kursor/plans/demo.plan.md",
    });
    next.setInteractionMode("agent");
    expect(evaluateWorkflowGate("write_file", { path: "src/a.ts" }, true, next)).toEqual({
      decision: "deny",
      reason: LOAD_EXECUTING_PLANS_REASON,
    });
    next.markSkillCheck("executing-plans");
    expect(evaluateWorkflowGate("write_file", { path: "src/a.ts" }, true, next)).toEqual({
      decision: "deny",
      reason: LOAD_TDD_REASON,
    });
    next.markSkillCheck("test-driven-development");
    expect(evaluateWorkflowGate("write_file", { path: "src/a.ts" }, true, next)).toEqual({
      decision: "deny",
      reason: TODO_IN_PROGRESS_REASON,
    });
    next.setActiveTodo("todo-1");
    expect(evaluateWorkflowGate("write_file", { path: "src/a.ts" }, true, next)).toEqual({
      decision: "deny",
      reason: WAIT_FOR_AGENT_BRANCH_REASON,
    });
    next.agentBranch = { name: "kursor-x", base: "main" };
    expect(evaluateWorkflowGate("write_file", { path: "src/a.ts" }, true, next).decision).toBe("allow");
  });

  it("allows git_commit and git_push before the agent branch even without executing-plans", () => {
    const next = session({
      skillCheckThisTurn: true,
      goalKind: "build",
      designApproved: { scope: "x", at: 1 },
      planApproved: true,
      planPath: ".kursor/plans/demo.plan.md",
    });
    next.setInteractionMode("agent");
    expect(evaluateWorkflowGate("git_commit", { message: "Add plan" }, true, next).decision).toBe("allow");
    expect(evaluateWorkflowGate("git_push", {}, true, next).decision).toBe("allow");
    expect(evaluateWorkflowGate("write_file", { path: "src/a.ts" }, true, next)).toEqual({
      decision: "deny",
      reason: LOAD_EXECUTING_PLANS_REASON,
    });
    expect(evaluateWorkflowGate("run_command", { command: "git status" }, true, next)).toEqual({
      decision: "deny",
      reason: LOAD_EXECUTING_PLANS_REASON,
    });
  });

  it("denies source mutations after Build until git_branch create", () => {
    const next = session({
      skillCheckThisTurn: true,
      goalKind: "build",
      designApproved: { scope: "x", at: 1 },
      planApproved: true,
      planPath: ".kursor/plans/demo.plan.md",
      invokedSkillIds: ["executing-plans", "test-driven-development"],
    });
    next.setInteractionMode("agent");
    next.setActiveTodo("todo-1");
    expect(evaluateWorkflowGate("git_branch", { action: "create" }, true, next).decision).toBe("allow");
    expect(evaluateWorkflowGate("git_status", {}, false, next).decision).toBe("allow");
    expect(evaluateWorkflowGate("git_commit", { message: "Add plan" }, true, next).decision).toBe("allow");
    expect(evaluateWorkflowGate("git_push", {}, true, next).decision).toBe("allow");
    expect(evaluateWorkflowGate("write_file", { path: "src/a.ts" }, true, next)).toEqual({
      decision: "deny",
      reason: WAIT_FOR_AGENT_BRANCH_REASON,
    });
    expect(evaluateWorkflowGate("apply_patch", { path: "src/a.ts" }, true, next)).toEqual({
      decision: "deny",
      reason: WAIT_FOR_AGENT_BRANCH_REASON,
    });
    expect(evaluateWorkflowGate("run_command", { command: "pnpm test" }, true, next)).toEqual({
      decision: "deny",
      reason: WAIT_FOR_AGENT_BRANCH_REASON,
    });
    expect(evaluateWorkflowGate("agent", { subagent_type: "implement" }, false, next)).toEqual({
      decision: "deny",
      reason: WAIT_FOR_AGENT_BRANCH_REASON,
    });
    expect(evaluateWorkflowGate("agent", { subagent_type: "explore" }, false, next).decision).toBe("allow");
    next.agentBranch = { name: "kursor-x", base: "main" };
    expect(evaluateWorkflowGate("write_file", { path: "src/a.ts" }, true, next).decision).toBe("allow");
  });

  it("allows mutations on main after a completed plan is merged", () => {
    const next = session({
      skillCheckThisTurn: true,
      goalKind: "build",
      designApproved: { scope: "x", at: 1 },
      planApproved: true,
      planPath: ".kursor/plans/demo.plan.md",
      planTodosComplete: true,
      invokedSkillIds: ["executing-plans", "test-driven-development", "using-kursor-shell", "verification-before-completion"],
    });
    next.setInteractionMode("agent");
    expect(next.agentBranch).toBeNull();
    expect(evaluateWorkflowGate("run_command", { command: "pnpm test" }, true, next).decision).toBe("allow");
    expect(evaluateWorkflowGate("write_file", { path: ".gitignore" }, true, next).decision).toBe("allow");
    expect(evaluateWorkflowGate("delete_file", { path: ".vite/deps/react.js" }, true, next).decision).toBe("allow");
  });

  it("still requires git_branch before mutations while todos remain", () => {
    const next = session({
      skillCheckThisTurn: true,
      goalKind: "build",
      designApproved: { scope: "x", at: 1 },
      planApproved: true,
      planPath: ".kursor/plans/demo.plan.md",
      invokedSkillIds: ["executing-plans", "test-driven-development"],
    });
    next.setInteractionMode("agent");
    next.setActiveTodo("todo-1");
    expect(evaluateWorkflowGate("run_command", { command: "pnpm test" }, true, next)).toEqual({
      decision: "deny",
      reason: WAIT_FOR_AGENT_BRANCH_REASON,
    });
  });

  it("allows finishing after all plan todos are complete", () => {
    const next = session({
      skillCheckThisTurn: true,
      goalKind: "build",
      designApproved: { scope: "x", at: 1 },
      planApproved: true,
      planPath: ".kursor/plans/demo.plan.md",
      invokedSkillIds: ["executing-plans", "test-driven-development", "using-kursor-shell"],
      agentBranch: { name: "kursor-x", base: "main" },
    });
    next.setInteractionMode("agent");
    expect(evaluateWorkflowGate("git_commit", { message: "feat" }, true, next)).toEqual({
      decision: "deny",
      reason: TODO_IN_PROGRESS_REASON,
    });
    next.setPlanTodosComplete(true);
    expect(evaluateWorkflowGate("git_commit", { message: "feat" }, true, next).decision).toBe("allow");
    expect(evaluateWorkflowGate("run_command", { command: "pnpm test" }, true, next).decision).toBe("allow");
    expect(evaluateWorkflowGate("finish_development_branch", { choice: "pr" }, true, next)).toEqual({
      decision: "deny",
      reason: LOAD_VERIFICATION_REASON,
    });
    next.markSkillCheck("verification-before-completion");
    expect(evaluateWorkflowGate("finish_development_branch", { choice: "pr" }, true, next).decision).toBe("allow");
  });

  it("still denies mutations while a pending todo remains", () => {
    const next = session({
      skillCheckThisTurn: true,
      goalKind: "build",
      designApproved: { scope: "x", at: 1 },
      planApproved: true,
      planPath: ".kursor/plans/demo.plan.md",
      invokedSkillIds: ["executing-plans", "test-driven-development"],
    });
    next.setInteractionMode("agent");
    next.setPlanTodosComplete(false);
    expect(evaluateWorkflowGate("write_file", { path: "src/a.ts" }, true, next)).toEqual({
      decision: "deny",
      reason: TODO_IN_PROGRESS_REASON,
    });
  });

  it("treats a stored done plan as complete when the session flag is stale", () => {
    usePlanStore.getState().reset();
    usePlanStore.getState().upsertPlan({
      id: "p",
      slug: "p",
      path: ".kursor/plans/demo.plan.md",
      name: "p",
      overview: "",
      body: "",
      todos: [{ id: "todo-1", content: "A", status: "completed" }],
      status: "done",
      createdAt: 1,
      updatedAt: 1,
    });
    const next = session({
      skillCheckThisTurn: true,
      goalKind: "build",
      designApproved: { scope: "x", at: 1 },
      planApproved: true,
      planPath: ".kursor/plans/demo.plan.md",
      invokedSkillIds: ["executing-plans", "test-driven-development"],
      planTodosComplete: false,
      agentBranch: { name: "kursor-x", base: "main" },
    });
    next.setInteractionMode("agent");
    expect(evaluateWorkflowGate("git_commit", { message: "feat" }, true, next).decision).toBe("allow");
  });

  it("allows update_plan_todo in agent mode after the skill check", () => {
    const gate = evaluateWorkflowGate(
      "update_plan_todo",
      { todo_id: "todo-1", status: "completed" },
      true,
      session({ skillCheckThisTurn: true, goalKind: "build", designApproved: { scope: "x", at: 1 } }),
    );
    expect(gate.decision).toBe("allow");
  });

  it("does not approve the plan via chat yes; Build is required", () => {
    const next = session({
      skillCheckThisTurn: true,
      goalKind: "build",
      designApproved: { scope: "design", at: 1 },
      planPath: ".kursor/plans/demo.plan.md",
      invokedSkillIds: ["brainstorming", "writing-plans"],
    });
    const result = next.beginUserTurn("oui");
    expect(result.planApproved).toBe(false);
    expect(next.planApproved).toBe(false);
    expect(next.interactionMode).toBe("plan");
    next.markSkillCheck();
    expect(
      evaluateWorkflowGate("agent", { subagent_type: "implement" }, false, next).decision,
    ).toBe("deny");
    const write = evaluateWorkflowGate("write_file", { path: "src/a.ts" }, true, next);
    expect(write.decision).toBe("deny");
    if (write.decision === "deny") expect(write.reason).toMatch(/Plan mode|Build/);
  });

  it("blocks writes in Ask mode and skips the 1% skill check", () => {
    const ask = session({ interactionMode: "ask" });
    expect(evaluateWorkflowGate("read_file", { path: "src/a.ts" }, false, ask).decision).toBe("allow");
    const write = evaluateWorkflowGate("write_file", { path: "src/a.ts" }, true, ask);
    expect(write.decision).toBe("deny");
    if (write.decision === "deny") expect(write.reason).toMatch(/Ask mode/);
  });

  it("allows run_command in Debug mode before systematic-debugging but not patches", () => {
    const debug = session({ skillCheckThisTurn: true, interactionMode: "debug", goalKind: "bug" });
    debug.markSkillCheck("using-kursor-shell");
    expect(evaluateWorkflowGate("run_command", { command: "pnpm test" }, true, debug).decision).toBe("allow");
    const patch = evaluateWorkflowGate("apply_patch", { path: "src/a.ts" }, true, debug);
    expect(patch.decision).toBe("deny");
    if (patch.decision === "deny") expect(patch.reason).toMatch(/systematic-debugging/);
  });

  it("denies run_command until using-kursor-shell is loaded", () => {
    const next = session({ skillCheckThisTurn: true, interactionMode: "debug", goalKind: "bug" });
    expect(evaluateWorkflowGate("run_command", { command: "pnpm test" }, true, next)).toEqual({
      decision: "deny",
      reason: LOAD_KURSOR_SHELL_REASON,
    });
    expect(evaluateWorkflowGate("start_process", { command: "npm run dev" }, true, next)).toEqual({
      decision: "deny",
      reason: LOAD_KURSOR_SHELL_REASON,
    });
    next.markSkillCheck("using-kursor-shell");
    expect(evaluateWorkflowGate("run_command", { command: "pnpm test" }, true, next).decision).toBe("allow");
    expect(evaluateWorkflowGate("start_process", { command: "npm run dev" }, true, next).decision).toBe("allow");
  });

  it("blocks the next implement while a critical review is open", () => {
    const gate = evaluateWorkflowGate(
      "agent",
      { subagent_type: "implement" },
      false,
      session({ skillCheckThisTurn: true, criticalReviewOpen: true, planApproved: true, designApproved: { scope: "x", at: 1 } }),
    );
    expect(gate.decision).toBe("deny");
  });

  it("blocks implement spawn until the plan is approved", () => {
    const gate = evaluateWorkflowGate(
      "agent",
      { subagent_type: "implement" },
      false,
      session({ skillCheckThisTurn: true, designApproved: { scope: "x", at: 1 } }),
    );
    expect(gate.decision).toBe("deny");
  });

  it("denies implement until test-driven-development is loaded", () => {
    const next = session({
      skillCheckThisTurn: true,
      goalKind: "build",
      designApproved: { scope: "x", at: 1 },
      planApproved: true,
      invokedSkillIds: ["executing-plans"],
      agentBranch: { name: "kursor-x", base: "main" },
    });
    expect(evaluateWorkflowGate("agent", { subagent_type: "implement" }, false, next)).toEqual({
      decision: "deny",
      reason: LOAD_TDD_REASON,
    });
    next.markSkillCheck("test-driven-development");
    expect(evaluateWorkflowGate("agent", { subagent_type: "implement" }, false, next).decision).toBe("allow");
  });
});

describe("research subagents and VBC", () => {
  it("denies a design question until brainstorm research and explore ran", () => {
    const next = session({
      skillCheckThisTurn: true,
      goalKind: "build",
      invokedSkillIds: ["brainstorming"],
    });
    expect(evaluateWorkflowGate(
      "ask_user_question",
      { prompt: "Design?", kind: "design", options: [{ id: "a", label: "A" }] },
      false,
      next,
    )).toEqual({
      decision: "deny",
      reason: LOAD_BRAINSTORM_RESEARCH_REASON,
    });
    next.markSkillCheck("subagent-driven-brainstorming");
    expect(evaluateWorkflowGate(
      "ask_user_question",
      { prompt: "Design?", kind: "design", options: [{ id: "a", label: "A" }] },
      false,
      next,
    )).toEqual({
      decision: "deny",
      reason: BRAINSTORM_EXPLORE_REASON,
    });
    next.noteExploreStarting();
    expect(evaluateWorkflowGate(
      "ask_user_question",
      { prompt: "Design?", kind: "design", options: [{ id: "a", label: "A" }] },
      false,
      next,
    )).toEqual({
      decision: "deny",
      reason: BRAINSTORM_EXPLORE_REASON,
    });
    next.noteExploreStarting();
    expect(evaluateWorkflowGate(
      "ask_user_question",
      { prompt: "Design?", kind: "design", options: [{ id: "a", label: "A" }] },
      false,
      next,
    ).decision).toBe("allow");
  });

  it("denies explore during brainstorming until the research skill is loaded", () => {
    const next = session({
      skillCheckThisTurn: true,
      goalKind: "build",
      invokedSkillIds: ["brainstorming"],
    });
    expect(evaluateWorkflowGate("agent", { subagent_type: "explore" }, false, next)).toEqual({
      decision: "deny",
      reason: LOAD_BRAINSTORM_RESEARCH_REASON,
    });
    next.markSkillCheck("subagent-driven-brainstorming");
    expect(evaluateWorkflowGate("agent", { subagent_type: "explore" }, false, next).decision).toBe("allow");
  });
});

describe("workflow session reset", () => {
  it("clears design and plan approval", () => {
    const next = new WorkflowSessionState();
    next.approveDesign("yes");
    next.approvePlan();
    next.markSkillCheck("brainstorming");
    const previous = next.snapshot();
    next.reset();
    expect(next.designApproved).toBeNull();
    expect(next.planApproved).toBe(false);
    expect(next.invokedSkillIds).toEqual([]);
    expect(next.interactionMode).toBe("agent");
    next.restore(previous);
    expect(next.designApproved).toBeTruthy();
    expect(next.planApproved).toBe(true);
  });

  it("closes a finished implementation cycle on the next user turn", () => {
    const next = session({
      planApproved: true,
      planPath: ".kursor/plans/demo.plan.md",
      designApproved: { scope: "x", at: 1 },
      invokedSkillIds: ["executing-plans", "test-driven-development"],
      goalKind: "build",
    });
    next.setInteractionMode("agent");
    expect(shouldCloseImplementationCycle(next, { status: "done", todos: [{ status: "completed" }] })).toBe(true);
    next.beginUserTurn("add a settings page", { cycleIdle: true });
    expect(next.planApproved).toBe(false);
    expect(next.planPath).toBeNull();
    expect(next.designApproved).toBeNull();
    expect(next.invokedSkillIds).toEqual([]);
    expect(next.interactionMode).toBe("agent");
    next.markSkillCheck("brainstorming");
    const result = next.beginUserTurn("oui");
    expect(result.designApproved).toBe(true);
    expect(next.designApproved).toBeTruthy();
  });

  it("keeps a finished plan open when the user asks to finalize or verify", () => {
    const next = session({
      planApproved: true,
      planPath: ".kursor/plans/demo.plan.md",
      designApproved: { scope: "x", at: 1 },
      planTodosComplete: true,
      goalKind: "build",
    });
    const plan = { status: "done", todos: [{ status: "completed" }] };
    expect(shouldCloseImplementationCycle(next, plan, "finalise l'implémentation")).toBe(false);
    expect(shouldCloseImplementationCycle(next, plan, "verify the routes")).toBe(false);
    expect(shouldCloseImplementationCycle(next, plan, "add a settings page")).toBe(true);
  });

  it("classifies finalize prompts as a build continuation", () => {
    const next = new WorkflowSessionState();
    next.beginUserTurn("finalise l'implémentation de l'application de sport");
    expect(next.goalKind).toBe("build");
  });

  it("does not close while plan todos remain", () => {
    const next = session({
      planApproved: true,
      planPath: ".kursor/plans/demo.plan.md",
      designApproved: { scope: "x", at: 1 },
      invokedSkillIds: ["executing-plans", "test-driven-development"],
      goalKind: "build",
    });
    const plan = { status: "building", todos: [{ status: "completed" }, { status: "pending" }] };
    expect(shouldCloseImplementationCycle(next, plan)).toBe(false);
    next.beginUserTurn("also persist the cart", { cycleIdle: false });
    expect(next.planApproved).toBe(true);
    expect(next.planPath).toBe(".kursor/plans/demo.plan.md");
    expect(next.invokedSkillIds).toEqual(["executing-plans", "test-driven-development"]);
  });

  it("does not close the cycle when skipProcess is set", () => {
    const next = session({
      planApproved: true,
      planPath: ".kursor/plans/demo.plan.md",
      skipProcess: true,
      planTodosComplete: true,
    });
    expect(shouldCloseImplementationCycle(next, { status: "done", todos: [{ status: "completed" }] }, "add a settings page")).toBe(false);
  });

  it("does not close before the current plan is loaded", () => {
    const next = session({
      planApproved: true,
      planPath: ".kursor/plans/demo.plan.md",
    });
    expect(shouldCloseImplementationCycle(next, null)).toBe(false);
  });

  it("closes a completed cycle even when the plan document is missing", () => {
    const next = session({
      planApproved: true,
      planPath: ".kursor/plans/demo.plan.md",
      planTodosComplete: true,
    });
    expect(shouldCloseImplementationCycle(next, null)).toBe(true);
    expect(shouldCloseImplementationCycle(next, null, "verify the routes")).toBe(false);
  });
});
