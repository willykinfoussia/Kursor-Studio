import { describe, expect, it } from "vitest";
import { applyAgentEvent, DESIGN_APPROVED_NOTICE, timelineFromMessages } from "../applyAgentEvent";
import { CHAT_EVENT_POLICY } from "../chatPolicy";
import type { AgentEvent, AgentMessage } from "../../types";
import type { ConversationItem } from "../types";

const user: AgentMessage = { id: "u1", role: "user", content: "Hello", timestamp: 1 };

function reduce(events: AgentEvent[], start: ConversationItem[] = []) {
  return events.reduce((items, event) => applyAgentEvent(items, event, { now: 1 }), start);
}

describe("applyAgentEvent", () => {
  it("keeps timeline across a second started event", () => {
    const items = reduce([
      { type: "started", requestId: "r1", messageId: "a1", model: "m", userMessage: user },
      { type: "text-delta", messageId: "a1", text: "Hi" },
      { type: "started", requestId: "r2", messageId: "a2", model: "m", userMessage: { ...user, id: "u2", content: "Again" } },
    ]);
    expect(items.filter((item) => item.type === "user")).toHaveLength(2);
    expect(items.some((item) => item.type === "assistant" && item.content === "Hi")).toBe(true);
  });

  it("interleaves assistant segments around tools", () => {
    const items = reduce([
      { type: "started", requestId: "r1", messageId: "a1", model: "m", userMessage: user },
      { type: "text-delta", messageId: "a1", text: "Inspecting." },
      { type: "tool-started", id: "t1", tool: "read_file", input: { path: "src/App.tsx" } },
      { type: "tool-completed", id: "t1", tool: "read_file", output: { success: true } },
      { type: "text-delta", messageId: "a1", text: " Done." },
    ]);
    expect(items.map((item) => item.type)).toEqual(["user", "assistant", "tool", "assistant"]);
    expect(items[1]).toMatchObject({ type: "assistant", content: "Inspecting." });
    expect(items[3]).toMatchObject({ type: "assistant", content: " Done." });
  });

  it("appends consecutive text-delta to the same assistant segment", () => {
    const items = reduce([
      { type: "started", requestId: "r1", messageId: "a1", model: "m", userMessage: user },
      { type: "text-delta", messageId: "a1", text: "Hel" },
      { type: "text-delta", messageId: "a1", text: "lo" },
    ]);
    expect(items.filter((item) => item.type === "assistant")).toHaveLength(1);
    expect(items[1]).toMatchObject({ content: "Hello" });
  });

  it("projects tool-started and ignores extra items from tool-completed", () => {
    const items = reduce([
      { type: "tool-started", id: "t1", tool: "read_file", input: { path: "a.ts" } },
      { type: "tool-completed", id: "t1", tool: "read_file", output: { success: true } },
    ]);
    expect(items).toEqual([{ type: "tool", id: "tool:t1", toolCallId: "t1" }]);
  });

  it("hides checkpoints, fallback, approvals and permission-resolved", () => {
    const items = reduce([
      { type: "started", requestId: "r1", messageId: "a1", model: "m", userMessage: user },
      { type: "fallback", fromModel: "a", toModel: "b", reason: "timeout" },
      {
        type: "permission-required",
        id: "p1",
        tool: "run_command",
        input: { command: "pnpm add zod" },
        reason: "install",
        riskLevel: "high",
        capability: "terminal.execute",
        scope: { kind: "project" },
        mode: "workspace-write",
      },
      { type: "approval-resolved", id: "p1", kind: "permission", decision: "allow-task" },
      { type: "recovery-checkpoint", checkpoint: { id: "cp1" } as never },
      { type: "compacted", summary: "x", kept: 2, dropped: 1 },
      { type: "verification-started", requestId: "r1" },
      { type: "verification-completed", requestId: "r1", ok: true, blockers: [], commands: ["tsc"], attempt: 1 },
      { type: "completed", requestId: "r1", messageId: "a1", model: "m" },
    ]);
    expect(items.map((item) => item.type)).toEqual(["user", "verification", "completion"]);
    expect(items.some((item) => item.type === "approval" || item.type === "fallback")).toBe(false);
    expect(items.some((item) => item.type === "system" && item.kind === "checkpoint")).toBe(false);
  });

  it("builds a compact plan from workflow events", () => {
    const items = reduce([
      { type: "workflow-started", runId: "w1", workflowId: "feature", complexity: "medium", stepIds: ["inspect", "implement"] },
      { type: "workflow-step", runId: "w1", stepId: "inspect", status: "running" },
      { type: "workflow-step", runId: "w1", stepId: "inspect", status: "completed" },
      { type: "workflow-completed", runId: "w1", workflowId: "feature", complexity: "medium", status: "completed" },
    ]);
    const plan = items.find((item) => item.type === "plan");
    expect(plan).toMatchObject({ type: "plan", status: "completed" });
    if (plan?.type === "plan") {
      expect(plan.steps[0]?.status).toBe("completed");
    }
    expect(items.some((item) => item.type === "task")).toBe(false);
  });

  it("seeds a timeline from persisted messages", () => {
    const items = timelineFromMessages([
      user,
      { id: "a1", role: "assistant", content: "**Hi**", timestamp: 2 },
    ]);
    expect(items.map((item) => item.type)).toEqual(["user", "assistant"]);
  });

  it("maps every event type in the chat policy table", () => {
    expect(Object.keys(CHAT_EVENT_POLICY).length).toBeGreaterThan(30);
    expect(CHAT_EVENT_POLICY["permission-required"]).toBe("dock");
    expect(CHAT_EVENT_POLICY["recovery-checkpoint"]).toBe("hidden");
    expect(CHAT_EVENT_POLICY["approval-resolved"]).toBe("strip-approval");
    expect(CHAT_EVENT_POLICY["change-set-created"]).toBe("hidden");
    expect(CHAT_EVENT_POLICY["review-completed"]).toBe("timeline");
    expect(CHAT_EVENT_POLICY["branch-created"]).toBe("hidden");
    expect(CHAT_EVENT_POLICY["merge-conflicts"]).toBe("timeline");
  });

  it("hides branch-created events from the chat timeline", () => {
    const items = reduce([
      { type: "branch-created", branch: "kursor-boxscore", base: "main" },
    ]);
    expect(items).toEqual([]);
  });

  it("lists merge conflict paths on the timeline", () => {
    const items = reduce([
      { type: "merge-conflicts", branch: "feat", base: "main", files: ["src/App.tsx"] },
    ]);
    expect(items).toEqual([
      expect.objectContaining({
        type: "system",
        kind: "error",
        text: expect.stringContaining("src/App.tsx"),
      }),
    ]);
  });

  it("keeps per-hunk review events out of the timeline", () => {
    const items = reduce([
      { type: "started", requestId: "r1", messageId: "a1", model: "m", userMessage: user },
      {
        type: "permission-required",
        id: "p1",
        tool: "write_file",
        input: { path: "a.ts" },
        reason: "write",
        riskLevel: "medium",
        capability: "filesystem.write",
        scope: { kind: "project" },
        mode: "workspace-write",
      },
      { type: "change-set-created", projectId: "p", runId: "r1", changeSetId: "cs1" },
      { type: "file-change-detected", projectId: "p", runId: "r1", changeSetId: "cs1", path: "a.ts" },
      { type: "change-hunk-created", projectId: "p", runId: "r1", changeSetId: "cs1", hunkId: "h1" },
      { type: "change-hunk-accepted", projectId: "p", runId: "r1", changeSetId: "cs1", hunkId: "h1" },
    ]);
    expect(items.map((item) => item.type)).toEqual(["user"]);
    expect(items.some((item) => item.type === "approval")).toBe(false);
  });

  it("appends a single compact review-completed summary", () => {
    const items = reduce([
      { type: "started", requestId: "r1", messageId: "a1", model: "m", userMessage: user },
      {
        type: "review-completed",
        projectId: "p",
        runId: "r1",
        changeSetId: "cs1",
        accepted: 2,
        rejected: 1,
        partial: 0,
        conflicted: 0,
      },
    ]);
    expect(items.map((item) => item.type)).toEqual(["user", "review-summary"]);
    expect(items[1]).toMatchObject({
      type: "review-summary",
      changeSetId: "cs1",
      accepted: 2,
      rejected: 1,
    });
  });

  it("appends a knowledge proposal card when the reflector finishes", () => {
    const empty = reduce([
      { type: "started", requestId: "r1", messageId: "a1", model: "m", userMessage: user },
      { type: "knowledge-reflect-completed", runId: "r1", proposalId: "kp-empty", summary: "Nothing durable", skillCount: 0, specCount: 0 },
    ]);
    expect(empty.map((item) => item.type)).toEqual(["user", "knowledge-proposal"]);
    expect(empty[1]).toMatchObject({
      type: "knowledge-proposal",
      proposalId: "kp-empty",
      summary: "Nothing durable",
    });
    const items = reduce([
      { type: "started", requestId: "r1", messageId: "a1", model: "m", userMessage: user },
      {
        type: "knowledge-reflect-completed",
        runId: "r1",
        proposalId: "kp-1",
        summary: "Capture JWT procedure",
        skillCount: 1,
        specCount: 0,
      },
    ]);
    expect(items.map((item) => item.type)).toEqual(["user", "knowledge-proposal"]);
    expect(items[1]).toMatchObject({
      type: "knowledge-proposal",
      proposalId: "kp-1",
      summary: "Capture JWT procedure",
    });
    expect(CHAT_EVENT_POLICY["knowledge-reflect-started"]).toBe("hidden");
    expect(CHAT_EVENT_POLICY["knowledge-reflect-completed"]).toBe("timeline");
    expect(CHAT_EVENT_POLICY["knowledge-reflect-skipped"]).toBe("timeline");
    const failed = reduce([
      { type: "knowledge-reflect-skipped", runId: "r1", reason: "failed", error: "gateway timeout" },
    ]);
    expect(failed).toEqual([{
      type: "system",
      id: "knowledge-skip:r1:failed",
      kind: "knowledge",
      text: "Knowledge reflect failed: gateway timeout",
    }]);
    const noLlm = reduce([
      { type: "knowledge-reflect-skipped", runId: "r1", reason: "no-llm" },
    ]);
    expect(noLlm[0]).toMatchObject({ kind: "knowledge", text: "Knowledge reflect skipped: no LLM available." });
    const trivial = reduce([
      { type: "knowledge-reflect-skipped", runId: "r2", reason: "trivial" },
    ]);
    expect(trivial).toEqual([]);
  });

  it("puts ask_user_question on the timeline and records the selected answer", () => {
    expect(CHAT_EVENT_POLICY["user-question"]).toBe("timeline");
    const items = reduce([
      { type: "started", requestId: "r1", messageId: "a1", model: "m", userMessage: user },
      {
        type: "user-question",
        id: "q1",
        prompt: "Which UI?",
        options: ["Modern orange", "Keep current"],
        choices: [
          { id: "modern", label: "Modern orange", description: "Tailwind refresh" },
          { id: "keep", label: "Keep current" },
        ],
        kind: "question",
      },
      { type: "approval-resolved", id: "q1", kind: "workflow", decision: "allow", selected: "A custom layout" },
    ]);
    expect(items[1]).toMatchObject({
      type: "user-question",
      questionId: "q1",
      prompt: "Which UI?",
      selected: "A custom layout",
    });
  });

  it("ignores whitespace-only text-delta until real text arrives", () => {
    const items = reduce([
      { type: "started", requestId: "r1", messageId: "a1", model: "m", userMessage: user },
      { type: "text-delta", messageId: "a1", text: "  " },
      { type: "tool-started", id: "t1", tool: "read_file", input: { path: "a.ts" } },
      { type: "text-delta", messageId: "a1", text: "  " },
      { type: "text-delta", messageId: "a1", text: "Done." },
    ]);
    expect(items.map((item) => item.type)).toEqual(["user", "tool", "assistant"]);
    expect(items[2]).toMatchObject({ type: "assistant", content: "Done." });
  });

  it("renders design-gate approved as a mode notice", () => {
    const items = reduce([
      { type: "design-gate", reason: "approved", tool: "chat" },
    ]);
    expect(items).toEqual([{
      type: "system",
      id: "design-gate:0",
      kind: "mode",
      text: DESIGN_APPROVED_NOTICE,
    }]);
  });

  it("renders other design-gate reasons as errors", () => {
    const items = reduce([
      { type: "design-gate", reason: "Explain prompts should not spawn implement subagents.", tool: "agent" },
    ]);
    expect(items[0]).toMatchObject({
      type: "system",
      kind: "error",
      text: "Explain prompts should not spawn implement subagents.",
    });
  });

  it("updates a subagent task activity from child tools and hides parent agent calls", () => {
    const items = reduce([
      { type: "subagent-task-started", taskId: "task-a", agentId: "explore", title: "KEEP map" },
      { type: "tool-started", id: "parent-agent", tool: "agent", input: { description: "KEEP map", subagent_type: "explore" } },
      { type: "tool-started", id: "t1", tool: "read_file", input: { path: "src/App.tsx" }, taskId: "task-a", agentId: "explore" },
      { type: "tool-completed", id: "t1", tool: "read_file", output: { success: true }, taskId: "task-a", agentId: "explore" },
      { type: "subagent-task-completed", taskId: "task-a", agentId: "explore" },
    ]);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      type: "task",
      taskId: "task-a",
      title: "KEEP map",
      status: "completed",
      activity: "Reading src/App.tsx...",
      toolCallIds: ["t1"],
    });
  });

  it("renders hook-denied as a mode notice, not Unable to continue", () => {
    const items = reduce([
      { type: "hook-denied", event: "before_tool", message: "Path .git is protected" },
    ]);
    expect(items).toEqual([{
      type: "system",
      id: "hook-denied:before_tool:0",
      kind: "mode",
      text: "Path .git is protected",
    }]);
    expect(JSON.stringify(items)).not.toMatch(/Unable to continue/);
  });
});
