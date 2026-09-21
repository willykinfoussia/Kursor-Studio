import { describe, expect, it } from "vitest";
import { CompactionManager } from "../CompactionManager";
import { SESSION_COMPACT_PREFIX } from "../types";
import type { AgentMessage } from "../../types";

function message(id: string, role: AgentMessage["role"], content: string): AgentMessage {
  return { id, role, content, timestamp: 1 };
}

describe("CompactionManager", () => {
  it("keeps tool pairs intact, preserves the user request, and extracts summary metadata", () => {
    const compaction = new CompactionManager();
    const messages: AgentMessage[] = [
      message("u0", "user", "Explore the repo"),
      message("a0", "assistant", "I decided to start with git status."),
      message("u1", "user", "List files"),
      message("a1", "assistant", "Calling list_files"),
      message("t1", "tool", "src/\nREADME.md"),
      message("u2", "user", "Add logout"),
      message("a2", "assistant", "I chose cookie sessions."),
      message("t2", "tool", "wrote auth.ts"),
      message("u3", "user", "Fix the login form"),
    ];

    const result = compaction.compact({
      messages,
      toolCalls: [
        { id: "call-1", tool: "list_files", input: {}, output: { ok: true }, status: "completed" },
        { id: "call-2", tool: "write_file", input: { path: "auth.ts" }, status: "failed" },
        { id: "call-3", tool: "run_command", input: { command: "pnpm test" }, status: "running" },
      ],
      currentTask: { id: "task", title: "Fix login", status: "running", progress: 20 },
      filesChanged: ["src/auth.ts"],
      currentModel: "gpt-test",
      currentGoal: "Fix the login form",
      currentStep: "tool_call",
      keepCount: 3,
    });

    expect(result.keptMessages[0]?.content.startsWith(SESSION_COMPACT_PREFIX)).toBe(true);
    expect(result.keptMessages.some((item) => item.id === "u3")).toBe(true);
    const assistantIndex = result.keptMessages.findIndex((item) => item.id === "a2");
    const toolIndex = result.keptMessages.findIndex((item) => item.id === "t2");
    expect(assistantIndex).toBeGreaterThan(-1);
    expect(toolIndex).toBe(assistantIndex + 1);
    expect(result.summary).toContain("Explore the repo");
    expect(result.decisions.some((item) => /decided|chose/i.test(item))).toBe(true);
    expect(result.currentState).toContain("Fix the login form");
    expect(result.filesChanged).toEqual(["src/auth.ts"]);
    expect(result.unresolvedIssues.some((item) => item.includes("write_file"))).toBe(true);
    expect(result.unresolvedIssues.some((item) => item.includes("run_command"))).toBe(true);
    expect(result.unresolvedIssues.some((item) => item.includes("Fix login"))).toBe(true);
  });

    it("always keeps the latest user request even when it sits outside the tail", () => {
      const compaction = new CompactionManager();
      const messages: AgentMessage[] = [
        message("req", "user", "Fix the login form"),
        ...Array.from({ length: 12 }, (_, index) => message(`a${index}`, "assistant", `note ${index}`)),
      ];
      const result = compaction.compact({
        messages,
        toolCalls: [],
        currentTask: null,
        filesChanged: [],
        currentModel: "gpt-test",
        currentGoal: "Fix the login form",
        currentStep: "thinking",
        keepCount: 2,
      });
      expect(result.keptMessages.some((item) => item.id === "req")).toBe(true);
      expect(result.keptMessages.some((item) => item.id === "a11")).toBe(true);
    });

    it("needs compact when history or tokens overflow", () => {
      const compaction = new CompactionManager();
      const messages = Array.from({ length: 40 }, (_, index) => (
        message(`m${index}`, index % 2 === 0 ? "user" : "assistant", "hello world")
      ));
      expect(compaction.needsCompact(messages, { maxTokens: 100_000, maxHistoryMessages: 30 })).toBe(true);
      expect(compaction.needsCompact([message("u", "user", "hi")], { maxTokens: 100_000, maxHistoryMessages: 30 })).toBe(false);
      expect(compaction.needsCompact([message("u", "user", "x".repeat(80))], { maxTokens: 10, maxHistoryMessages: 30 })).toBe(true);
    });
});
