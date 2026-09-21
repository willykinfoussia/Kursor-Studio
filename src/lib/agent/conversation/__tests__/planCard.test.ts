import { describe, expect, it } from "vitest";
import { applyAgentEvent, timelineFromMessages } from "../applyAgentEvent";
import { CHAT_EVENT_POLICY } from "../chatPolicy";
import type { AgentEvent } from "../../types";
import type { ConversationItem } from "../types";

function reduce(events: AgentEvent[], start: ConversationItem[] = []) {
  return events.reduce((items, event) => applyAgentEvent(items, event, { now: 1 }), start);
}

describe("plan-card timeline", () => {
  it("hides the Build prompt from the user timeline", () => {
    const prompt = "Build the approved plan \"Demo\" at .kursor/plans/demo.plan.md.\nOverview: Ship it";
    const items = reduce([
      {
        type: "started",
        requestId: "r1",
        messageId: "a1",
        model: "m",
        userMessage: { id: "u-build", role: "user", content: prompt, timestamp: 1 },
      },
      { type: "plan-created", planId: ".kursor/plans/demo.plan.md", path: ".kursor/plans/demo.plan.md", name: "Demo", overview: "Ship it", todoCount: 3 },
    ]);
    expect(items.filter((item) => item.type === "user")).toHaveLength(0);
    expect(items.some((item) => item.type === "plan-card")).toBe(true);
    expect(timelineFromMessages([
      { id: "u-build", role: "user", content: prompt, timestamp: 1 },
      { id: "a1", role: "assistant", content: "Working.", timestamp: 2 },
    ]).filter((item) => item.type === "user")).toHaveLength(0);
  });

  it("creates a plan-card item from plan-created", () => {
    const items = reduce([
      { type: "plan-created", planId: ".kursor/plans/demo.plan.md", path: ".kursor/plans/demo.plan.md", name: "Demo", overview: "Ship it", todoCount: 3 },
    ]);
    expect(items).toEqual([{ type: "plan-card", id: "plan-card:.kursor/plans/demo.plan.md", planId: ".kursor/plans/demo.plan.md" }]);
  });

  it("dedupes repeated plan-created events", () => {
    const event: AgentEvent = { type: "plan-created", planId: "p1", path: "p1", name: "Demo", overview: "", todoCount: 1 };
    const items = reduce([event, event]);
    expect(items.filter((item) => item.type === "plan-card")).toHaveLength(1);
  });

  it("keeps plan progress events out of the timeline", () => {
    expect(CHAT_EVENT_POLICY["plan-created"]).toBe("timeline");
    expect(CHAT_EVENT_POLICY["plan-todo-updated"]).toBe("hidden");
    expect(CHAT_EVENT_POLICY["plan-build-started"]).toBe("hidden");
    expect(CHAT_EVENT_POLICY["plan-completed"]).toBe("hidden");
    const items = reduce([
      { type: "plan-todo-updated", planId: "p1", todoId: "todo-1", status: "completed", done: 1, total: 2 },
      { type: "plan-build-started", planId: "p1", path: "p1" },
      { type: "plan-completed", planId: "p1", path: "p1" },
    ]);
    expect(items).toEqual([]);
  });
});
