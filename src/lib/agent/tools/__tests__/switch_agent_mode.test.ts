import { describe, expect, it } from "vitest";
import { PLAN_TO_AGENT_BLOCKED, planToAgentBlocked, type AgentInteractionMode } from "../../modes";
import { createEnterPlanModeTool, createSwitchAgentModeTool } from "../workflowTools";
import { idleToolContext } from "../result";
import { WorkflowSessionState } from "../../workflow/sessionState";
import type { AgentHarnessHooks } from "../../workflow/harness";

function mockHarness(session = new WorkflowSessionState()): AgentHarnessHooks {
  const harness: AgentHarnessHooks = {
    workflow: session,
    isSubagent: false,
    askUser: async () => ({ selected: "", allow: false }),
    spawnAgent: async () => ({
      agentId: "explore",
      summary: "",
      findings: [],
      filesChanged: [],
      tests: [],
      issues: [],
    }),
    enterPlanMode: () => harness.switchAgentMode("plan"),
    switchAgentMode: (mode: AgentInteractionMode) => {
      if (mode !== "agent" && mode !== "plan") {
        return { ok: false, message: "Ask and Debug can only be selected by the user." };
      }
      const blocked = planToAgentBlocked(session, mode);
      if (blocked) return { ok: false, message: blocked };
      session.setInteractionMode(mode);
      return { ok: true, message: `${mode} on` };
    },
    ensureAgentBranch: async () => ({ message: "ok" }),
    finishBranch: async () => ({ message: "ok" }),
  };
  return harness;
}

describe("switch_agent_mode", () => {
  it("switches to Plan and back to Agent after Build", async () => {
    const harness = mockHarness();
    const tool = createSwitchAgentModeTool();
    const plan = await tool.execute({ mode: "plan" }, idleToolContext("C:/Projects/TodoApp", { harness }));
    expect(plan.success).toBe(true);
    expect(plan.data).toEqual({ mode: "plan", planMode: true });
    const blocked = await tool.execute({ mode: "agent" }, idleToolContext("C:/Projects/TodoApp", { harness }));
    expect(blocked.success).toBe(false);
    expect(blocked.error?.message).toBe(PLAN_TO_AGENT_BLOCKED);
    harness.workflow.approvePlan();
    const agent = await tool.execute({ mode: "agent" }, idleToolContext("C:/Projects/TodoApp", { harness }));
    expect(agent.success).toBe(true);
    expect(agent.data).toEqual({ mode: "agent", planMode: false });
  });

  it("refuses Ask and Debug", async () => {
    const harness = mockHarness();
    const tool = createSwitchAgentModeTool();
    const ask = await tool.execute({ mode: "ask" }, idleToolContext("C:/Projects/TodoApp", { harness }));
    expect(ask.success).toBe(false);
    expect(ask.error?.code).toBe("mode_locked");
    const debug = await tool.execute({ mode: "debug" }, idleToolContext("C:/Projects/TodoApp", { harness }));
    expect(debug.success).toBe(false);
    expect(debug.error?.code).toBe("mode_locked");
  });

  it("keeps enter_plan_mode as a Plan/Agent alias", async () => {
    const harness = mockHarness();
    const tool = createEnterPlanModeTool();
    const entered = await tool.execute({ enabled: true }, idleToolContext("C:/Projects/TodoApp", { harness }));
    expect(entered.success).toBe(true);
    expect(entered.data).toEqual({ mode: "plan", planMode: true });
    const left = await tool.execute({ enabled: false }, idleToolContext("C:/Projects/TodoApp", { harness }));
    expect(left.success).toBe(false);
    expect(left.error?.message).toBe(PLAN_TO_AGENT_BLOCKED);
    harness.workflow.approvePlan();
    const afterBuild = await tool.execute({ enabled: false }, idleToolContext("C:/Projects/TodoApp", { harness }));
    expect(afterBuild.success).toBe(true);
    expect(afterBuild.data).toEqual({ mode: "agent", planMode: false });
    const denied = await tool.execute({ mode: "ask" }, idleToolContext("C:/Projects/TodoApp", { harness }));
    expect(denied.error?.code).toBe("mode_locked");
  });
});
