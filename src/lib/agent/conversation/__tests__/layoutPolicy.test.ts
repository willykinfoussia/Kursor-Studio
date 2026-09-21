import { describe, expect, it } from "vitest";
import { defaultChatPrefs, getBlockPresentationState, shouldStickCurrentTask } from "../layoutPolicy";
import type { ConversationItem } from "../types";
import type { LayoutContext } from "../layoutPolicy";

const prefs = defaultChatPrefs();

function ctx(partial: Partial<LayoutContext> = {}): LayoutContext {
  return {
    prefs,
    status: "streaming",
    userExpanded: {},
    taskRunning: false,
    taskElapsedMs: 0,
    itemsAfterPlan: 0,
    stickyDismissed: false,
    ...partial,
  };
}

describe("getBlockPresentationState", () => {
  it("expands a running tool and collapses a completed one", () => {
    const item: ConversationItem = { type: "tool", id: "tool:1", toolCallId: "1" };
    expect(getBlockPresentationState(item, ctx({ toolStatus: "running" })).expanded).toBe(true);
    expect(getBlockPresentationState(item, ctx({ toolStatus: "completed" })).expanded).toBe(false);
  });

  it("does not reopen a user-collapsed tool", () => {
    const item: ConversationItem = { type: "tool", id: "tool:1", toolCallId: "1" };
    const state = getBlockPresentationState(item, ctx({
      toolStatus: "running",
      userExpanded: { "tool:1": false },
    }));
    expect(state.expanded).toBe(false);
  });

  it("focuses a pending approval", () => {
    const item: ConversationItem = { type: "approval", id: "approval:1", kind: "permission", approvalId: "p1" };
    const state = getBlockPresentationState(item, ctx({ pendingApprovalId: "p1", status: "waiting_approval" }));
    expect(state.focused).toBe(true);
    expect(state.expanded).toBe(true);
  });

  it("compacts a completed plan", () => {
    const item: ConversationItem = { type: "plan", id: "plan:1", steps: [], status: "completed" };
    expect(getBlockPresentationState(item, ctx()).expanded).toBe(false);
  });

  it("expands a failed verification", () => {
    const item: ConversationItem = {
      type: "verification",
      id: "v1",
      status: "completed",
      ok: false,
      blockers: ["fail"],
      commands: ["pnpm test"],
      attempt: 1,
    };
    expect(getBlockPresentationState(item, ctx()).expanded).toBe(true);
  });

  it("sticks a long-running task", () => {
    expect(shouldStickCurrentTask({
      prefs,
      taskRunning: true,
      taskElapsedMs: 20_000,
      itemsAfterPlan: 2,
      stickyDismissed: false,
    })).toBe(true);
    const item: ConversationItem = { type: "task", id: "t1", taskId: "x", title: "Auth", status: "running", progress: 65 };
    expect(getBlockPresentationState(item, ctx({ taskRunning: true, taskElapsedMs: 20_000 })).sticky).toBe(true);
    expect(getBlockPresentationState(item, ctx({ taskRunning: true })).expanded).toBe(false);
  });
});
