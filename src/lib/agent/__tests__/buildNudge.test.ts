import { describe, expect, it } from "vitest";
import {
  MAX_BUILD_NUDGES,
  buildMadeProgress,
  shouldNudgeBuildExecution,
} from "../AgentRuntime";

const building = {
  status: "building",
  todos: [
    { status: "completed" },
    { status: "pending" },
  ],
};

describe("shouldNudgeBuildExecution", () => {
  it("nudges in agent mode when a building plan still has pending todos", () => {
    expect(MAX_BUILD_NUDGES).toBe(16);
    expect(shouldNudgeBuildExecution("agent", { planApproved: true }, building)).toBe(true);
    expect(shouldNudgeBuildExecution("agent", { planApproved: true }, {
      status: "building",
      todos: [{ status: "in_progress" }, { status: "pending" }],
    })).toBe(true);
  });

  it("does not nudge when every todo is completed", () => {
    expect(shouldNudgeBuildExecution("agent", { planApproved: true }, {
      status: "building",
      todos: [{ status: "completed" }, { status: "completed" }],
    })).toBe(false);
  });

  it("does not nudge without an approved plan or a building plan", () => {
    expect(shouldNudgeBuildExecution("agent", { planApproved: false }, building)).toBe(false);
    expect(shouldNudgeBuildExecution("agent", {}, building)).toBe(false);
    expect(shouldNudgeBuildExecution("agent", { planApproved: true }, {
      status: "approved",
      todos: [{ status: "pending" }],
    })).toBe(false);
  });

  it("does not nudge in Plan mode", () => {
    expect(shouldNudgeBuildExecution("plan", { planApproved: true }, building)).toBe(false);
    expect(shouldNudgeBuildExecution("ask", { planApproved: true }, building)).toBe(false);
  });

  it("treats no progress as a stop, not another nudge", () => {
    expect(buildMadeProgress({ completed: 1, tools: 4 }, { completed: 1, tools: 4 })).toBe(false);
    expect(buildMadeProgress({ completed: 1, tools: 4 }, { completed: 2, tools: 4 })).toBe(true);
    expect(buildMadeProgress({ completed: 1, tools: 4 }, { completed: 1, tools: 5 })).toBe(true);
  });
});
