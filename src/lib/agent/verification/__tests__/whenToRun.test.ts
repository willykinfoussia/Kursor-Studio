import { describe, expect, it } from "vitest";
import { planVerificationRun } from "../whenToRun";
import { WorkflowSessionState } from "../../workflow/sessionState";
import type { ToolCall } from "../../types";

function session(partial: Partial<WorkflowSessionState> = {}) {
  const next = new WorkflowSessionState();
  Object.assign(next, partial);
  return next;
}

function call(tool: string, input: unknown, ok = true): ToolCall {
  return {
    id: `${tool}-${Math.random().toString(16).slice(2)}`,
    tool,
    input,
    output: { ok },
    status: ok ? "completed" : "failed",
  };
}

function completedTodo(): ToolCall {
  return call("update_plan_todo", { todo_id: "todo-1", status: "completed" });
}

describe("planVerificationRun", () => {
  it("skips outside an approved plan even after mutations", () => {
    expect(planVerificationRun({
      session: session({ planApproved: false }),
      toolCalls: [call("write_file", { path: "src/a.ts" })],
    })).toBeNull();
  });

  it("skips for subagents", () => {
    expect(planVerificationRun({
      session: session({ planApproved: true, invokedSkillIds: ["executing-plans"] }),
      isSubagent: true,
      toolCalls: [completedTodo()],
    })).toBeNull();
  });

  it("skips mutations while a todo is still in progress", () => {
    expect(planVerificationRun({
      session: session({
        planApproved: true,
        activeTodoId: "todo-1",
        invokedSkillIds: ["executing-plans", "test-driven-development"],
      }),
      toolCalls: [call("write_file", { path: "src/a.ts" }), call("run_command", { command: "pnpm test" })],
    })).toBeNull();
  });

  it("runs typecheck and test once when several todos complete in the same turn", () => {
    const planned = planVerificationRun({
      session: session({
        planApproved: true,
        invokedSkillIds: ["executing-plans", "test-driven-development"],
      }),
      toolCalls: [
        call("update_plan_todo", { todo_id: "todo-1", status: "completed" }),
        call("update_plan_todo", { todo_id: "todo-2", status: "completed" }),
        call("update_plan_todo", { todo_id: "todo-3", status: "completed" }),
        call("write_file", { path: "src/a.ts" }),
      ],
    });
    expect(planned).toEqual({ kinds: ["typecheck", "test"] });
  });

  it("skips the subset when the last todo completed and VBC is not loaded", () => {
    expect(planVerificationRun({
      session: session({
        planApproved: true,
        planTodosComplete: true,
        invokedSkillIds: ["executing-plans", "test-driven-development"],
      }),
      toolCalls: [completedTodo()],
    })).toBeNull();
  });

  it("runs the full suite after VBC when the plan is done", () => {
    expect(planVerificationRun({
      session: session({
        planApproved: true,
        planTodosComplete: true,
        invokedSkillIds: ["verification-before-completion"],
      }),
      toolCalls: [call("load_skill", { skill: "verification-before-completion" })],
    })).toEqual({});
  });

  it("runs the full suite on a later mutation after VBC", () => {
    expect(planVerificationRun({
      session: session({
        planApproved: true,
        planTodosComplete: true,
        invokedSkillIds: ["verification-before-completion"],
      }),
      toolCalls: [call("write_file", { path: "src/a.ts" })],
    })).toEqual({});
  });

  it("skips idle chat after VBC with no mutations", () => {
    expect(planVerificationRun({
      session: session({
        planApproved: true,
        planTodosComplete: true,
        invokedSkillIds: ["verification-before-completion"],
      }),
      toolCalls: [call("read_file", { path: "src/a.ts" })],
    })).toBeNull();
  });
});
