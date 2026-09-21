import { describe, expect, it } from "vitest";
import { GraphSource } from "../sources/graph";
import { ContextEngine } from "../ContextEngine";
import type { ContextSnapshot } from "../types";
import type { AgentMessage } from "../../types";

function snapshot(partial: Partial<ContextSnapshot> = {}): ContextSnapshot {
  const request = partial.request ?? "Improve the Finance Dashboard UI";
  const message: AgentMessage = { id: "u1", role: "user", content: request, timestamp: 1 };
  return {
    request,
    messages: partial.messages ?? [message],
    project: partial.project === undefined ? { id: "p1", name: "App", rootPath: "C:/Projects/App" } : partial.project,
    currentFile: partial.currentFile ?? { path: "src/ui/dashboard.tsx", content: "export function Dashboard() { return null }" },
    openFiles: partial.openFiles ?? [{ path: "src/ui/dashboard.tsx", isDirty: false }],
    toolCalls: [],
    webDocuments: [],
    activeTask: null,
    maxContextChars: 6_000,
    ...partial,
  };
}

describe("GraphSource", () => {
  it("skips without a project", async () => {
    const source = new GraphSource({
      graph: async () => [{ path: "a.py", content: "x", score: 1 }],
    });
    const result = await source.collect(snapshot({ project: null }), {
      maxTokens: 50_000,
      maxFileChars: 6_000,
      maxFiles: 8,
      maxRagChunks: 6,
      maxHistoryMessages: 30,
      maxWebDocs: 6,
      maxGraphFiles: 8,
    });
    expect(result.slices).toEqual([]);
    expect(result.skipReason).toBe("no project");
  });

  it("emits related files in the assembled prompt", async () => {
    const engine = new ContextEngine({
      retrievers: {
        memories: async () => [],
        rag: async () => [],
        graph: async () => [
          { path: "src/ui/dashboard.tsx", content: "dashboard", score: 1 },
          { path: ".kursor/specs/ui/finance/dashboard.md", content: "Dashboard spec", score: 0.9 },
          { path: "src/finance/margin.py", content: "def calculate_margin(): pass", score: 0.8 },
        ],
      },
    });
    const assembled = await engine.build(snapshot(), { budget: { maxTokens: 50_000 } });
    expect(assembled.slices.some((slice) => slice.source === "graph")).toBe(true);
    expect(assembled.systemPrompt).toContain("Related project files");
    expect(assembled.systemPrompt).toContain("src/finance/margin.py");
    expect(assembled.slices.filter((slice) => slice.source === "graph").every((slice) => slice.meta?.path !== "src/ui/dashboard.tsx")).toBe(true);
  });
});
