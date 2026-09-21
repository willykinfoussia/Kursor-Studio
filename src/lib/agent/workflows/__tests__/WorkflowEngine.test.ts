import { describe, expect, it } from "vitest";
import {
  WorkflowEngine,
  activeSteps,
  classifyTask,
  isDebugGoal,
  selectWorkflow,
} from "../index";

describe("TaskComplexity", () => {
  it("still classifies text for model routing hints, not as a runtime fork", () => {
    expect(classifyTask("renomme cette variable")).toBe("simple");
    expect(classifyTask("ajoute l'authentification OAuth")).toBe("complex");
  });
});

describe("WorkflowEngine", () => {
  it("runs every goal as a single parent act turn", async () => {
    const turns: string[][] = [];
    const engine = new WorkflowEngine();
    const context = await engine.run("ajoute l'authentification OAuth", {
      async runTurn(request) {
        turns.push(request.steps.map((step) => step.id));
        return { content: "done" };
      },
      async waitApproval() {
        return "allow";
      },
    });

    expect(turns).toEqual([["act"]]);
    expect(context.workflowId).toBe("agent-loop");
    expect(context.complexity).toBe("complex");
    expect(context.status).toBe("completed");
  });

  it("does not require plan approval or debug overlays at runtime", async () => {
    const goal = "the app crash on the failing test";
    expect(isDebugGoal(goal)).toBe(true);
    expect(selectWorkflow(goal).id).toBe("debug");
    const engine = new WorkflowEngine();
    const context = await engine.run(goal, {
      async runTurn() {
        return { content: "fixed" };
      },
      async waitApproval() {
        return "deny";
      },
    });
    expect(context.workflowId).toBe("agent-loop");
    expect(context.status).toBe("completed");
    expect(activeSteps(selectWorkflow("add a readme"), "medium").length).toBeGreaterThan(0);
  });

  it("forwards optional goalKind and skipProcess on workflow-started", async () => {
    const events: { type: string; goalKind?: string; skipProcess?: boolean }[] = [];
    const engine = new WorkflowEngine({
      onEvent: (event) => {
        if (event.type === "workflow-started") events.push(event);
      },
    });
    await engine.run("Let's make a todo list", {
      async runTurn() {
        return { content: "ok" };
      },
      async waitApproval() {
        return "allow";
      },
    }, { goalKind: "build", skipProcess: true });
    expect(events).toHaveLength(1);
    expect(events[0]?.goalKind).toBe("build");
    expect(events[0]?.skipProcess).toBe(true);
  });
});
