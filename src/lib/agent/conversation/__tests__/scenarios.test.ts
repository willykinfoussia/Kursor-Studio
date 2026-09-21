import { describe, expect, it } from "vitest";
import { applyAgentEvent } from "../applyAgentEvent";
import { groupTimelineItems } from "../toolGrouping";
import type { AgentEvent } from "../../types";
import type { ConversationItem } from "../types";

function play(events: AgentEvent[]) {
  return events.reduce((items, event) => applyAgentEvent(items, event, { now: 1, filesChanged: ["App.tsx"] }), [] as ConversationItem[]);
}

describe("UX scenarios", () => {
  it("scenario A — simple question is only user then assistant", () => {
    const items = play([
      { type: "started", requestId: "r", messageId: "a", model: "m", userMessage: { id: "u", role: "user", content: "Explique-moi App.tsx", timestamp: 1 } },
      { type: "text-delta", messageId: "a", text: "Voici le fichier." },
      { type: "completed", requestId: "r", messageId: "a", model: "m" },
    ]);
    expect(items.filter((item) => item.type === "plan" || item.type === "tool")).toHaveLength(0);
    expect(items.some((item) => item.type === "assistant")).toBe(true);
  });

  it("scenario B — small edit keeps tools inline and grouped", () => {
    const items = play([
      { type: "started", requestId: "r", messageId: "a", model: "m", userMessage: { id: "u", role: "user", content: "Rename", timestamp: 1 } },
      { type: "text-delta", messageId: "a", text: "Je lis le fichier." },
      { type: "tool-started", id: "t1", tool: "read_file", input: { path: "TodoItem.tsx" } },
      { type: "tool-completed", id: "t1", tool: "read_file", output: { success: true } },
      { type: "tool-started", id: "t2", tool: "apply_patch", input: { path: "TodoItem.tsx" } },
      { type: "tool-completed", id: "t2", tool: "apply_patch", output: { success: true, path: "TodoItem.tsx" } },
      { type: "verification-started", requestId: "r" },
      { type: "verification-completed", requestId: "r", ok: true, blockers: [], commands: ["tsc"], attempt: 1 },
      { type: "completed", requestId: "r", messageId: "a", model: "m" },
    ]);
    expect(items.map((item) => item.type)).toContain("tool");
    expect(items.map((item) => item.type)).toContain("verification");
    expect(items.at(-1)?.type).toBe("completion");
    expect(items.some((item) => item.type === "changes")).toBe(false);
    const views = groupTimelineItems(items, new Map([
      ["t1", { tool: "read_file", status: "completed" }],
      ["t2", { tool: "apply_patch", status: "completed" }],
    ]));
    expect(views.filter((view) => view.kind === "tool-group")).toHaveLength(1);
  });

  it("scenario D — approval is not a timeline item", () => {
    const items = play([
      { type: "started", requestId: "r", messageId: "a", model: "m", userMessage: { id: "u", role: "user", content: "Install", timestamp: 1 } },
      { type: "text-delta", messageId: "a", text: "Je vais installer." },
      {
        type: "permission-required",
        id: "p1",
        tool: "run_command",
        input: { command: "pnpm add zod" },
        reason: "network",
        riskLevel: "high",
        capability: "terminal.execute",
        scope: { kind: "project" },
        mode: "workspace-write",
      },
    ]);
    expect(items.some((item) => item.type === "approval")).toBe(false);
    expect(items.at(-1)?.type).toBe("assistant");
  });

  it("scenario F — successful fallback stays out of the chat", () => {
    const items = play([
      { type: "started", requestId: "r", messageId: "a", model: "m", userMessage: { id: "u", role: "user", content: "Go", timestamp: 1 } },
      { type: "fallback", fromModel: "laguna", toModel: "ling", reason: "unavailable" },
      { type: "text-delta", messageId: "a", text: "Je continue." },
    ]);
    expect(items.map((item) => item.type)).toEqual(["user", "assistant"]);
  });

  it("shows a compact verification failure", () => {
    const items = play([
      { type: "verification-started", requestId: "r" },
      { type: "verification-completed", requestId: "r", ok: false, blockers: ["Build failed"], commands: ["tsc", "lint", "test", "build"], attempt: 1 },
    ]);
    const verification = items.find((item) => item.type === "verification");
    expect(verification).toMatchObject({ type: "verification", ok: false });
  });
});
