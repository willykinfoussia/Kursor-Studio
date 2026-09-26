import { describe, expect, it } from "vitest";
import { MAX_PLAN_NUDGES, PLAN_NUDGE_MESSAGE, planNudgeMessage, shouldNudgePlanMode } from "../AgentRuntime";

const approved = { designApproved: { scope: "x", at: 1 }, planPath: null as string | null };

describe("shouldNudgePlanMode", () => {
  it("nudges once in plan mode when no plan tool and no question ran", () => {
    expect(MAX_PLAN_NUDGES).toBe(1);
    expect(shouldNudgePlanMode("plan", ["read_file", "list_files"], approved)).toBe(true);
    expect(shouldNudgePlanMode("plan", [], approved)).toBe(true);
  });

  it("nudges after a failed create_plan while the plan file is still missing", () => {
    expect(shouldNudgePlanMode("plan", ["create_plan"], approved)).toBe(true);
    expect(shouldNudgePlanMode("plan", ["read_file", "update_plan_todo"], approved)).toBe(true);
  });

  it("nudges after ask_user_question if the plan file is still missing", () => {
    expect(shouldNudgePlanMode("plan", ["ask_user_question"], approved)).toBe(true);
  });

  it("does not nudge before the design is approved", () => {
    expect(shouldNudgePlanMode("plan", [])).toBe(false);
    expect(shouldNudgePlanMode("plan", [], { designApproved: null, planPath: null })).toBe(false);
  });

  it("does not nudge when the plan file already exists", () => {
    expect(shouldNudgePlanMode("plan", ["create_plan"], {
      designApproved: { scope: "x", at: 1 },
      planPath: ".kursor/plans/demo.plan.md",
    })).toBe(false);
    expect(shouldNudgePlanMode("plan", [], {
      designApproved: { scope: "x", at: 1 },
      planPath: ".kursor/plans/demo.plan.md",
    })).toBe(false);
  });

  it("never nudges outside plan mode", () => {
    expect(shouldNudgePlanMode("agent", [], approved)).toBe(false);
    expect(shouldNudgePlanMode("ask", [], approved)).toBe(false);
    expect(shouldNudgePlanMode("debug", [], approved)).toBe(false);
  });

  it("tells the model to dispatch explore then create_plan after PLAN_EXPLORE_REASON", () => {
    expect(PLAN_NUDGE_MESSAGE).toMatch(/explore/i);
    expect(PLAN_NUDGE_MESSAGE).toMatch(/at least two explore/i);
    expect(PLAN_NUDGE_MESSAGE).toMatch(/Same-turn explores then create_plan/i);
    expect(planNudgeMessage({ planExploreDone: false })).toBe(PLAN_NUDGE_MESSAGE);
  });

  it("tells the model to create_plan without more explores once research is done", () => {
    const message = planNudgeMessage({ planExploreDone: true });
    expect(message).toMatch(/Explore research is done/i);
    expect(message).toMatch(/Call create_plan now/i);
    expect(message).toMatch(/Do not dispatch more explore subagents/i);
    expect(message).toMatch(/Do not end the turn with free text only/i);
    expect(message).not.toMatch(/at least two explore/i);
  });
});
