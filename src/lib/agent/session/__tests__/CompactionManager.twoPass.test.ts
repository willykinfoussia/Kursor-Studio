import { describe, expect, it } from "vitest";
import { CompactionManager } from "../CompactionManager";
import { SESSION_COMPACT_PREFIX } from "../types";
import type { AgentMessage } from "../../types";

function message(role: AgentMessage["role"], content: string, id = crypto.randomUUID()): AgentMessage {
  return { id, role, content, timestamp: 1 };
}

describe("CompactionManager extractive pass", () => {
  it("keeps a compact summary plus recent messages", () => {
    const compaction = new CompactionManager();
    const messages = [
      message("user", "first"),
      message("assistant", "old answer"),
      message("user", "second"),
      message("assistant", "later"),
      message("user", "latest"),
    ];
    const result = compaction.compact({
      messages,
      toolCalls: [],
      currentTask: null,
      filesChanged: ["src/a.ts"],
      currentModel: "m",
      currentGoal: "build a feature",
      currentStep: "act",
      keepCount: 2,
    });
    expect(result.keptMessages[0]?.content.startsWith(SESSION_COMPACT_PREFIX)).toBe(true);
    expect(result.filesChanged).toEqual(["src/a.ts"]);
    expect(result.keptMessages.length).toBeGreaterThan(1);
  });

  it("reports when history still exceeds the budget after extractive compact", () => {
    const compaction = new CompactionManager();
    const messages = Array.from({ length: 40 }, (_, index) => message("user", `m${index} ${"x".repeat(200)}`));
    const first = compaction.compact({
      messages,
      toolCalls: [],
      currentTask: null,
      filesChanged: [],
      currentModel: "m",
      currentGoal: null,
      currentStep: null,
      keepCount: 8,
    });
    expect(compaction.needsCompact(first.keptMessages, { maxTokens: 10, maxHistoryMessages: 4 })).toBe(true);
  });
});
