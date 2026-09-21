import { describe, expect, it, vi } from "vitest";
import { MemoryManager } from "../MemoryManager";
import type { Memory } from "../../../memory/types";
import type { RagResult } from "../../../rag/types";

describe("MemoryManager", () => {
  it("saves structured summary/decision/task_state and indexes conversation semantically", async () => {
    const structured: Memory[] = [];
    const semantic: { sourceType: string; content: string }[] = [];
    const manager = new MemoryManager({
      saveStructured: async (memory) => {
        structured.push(memory);
      },
      searchStructured: async () => structured,
      indexSemantic: async (input) => {
        semantic.push({ sourceType: input.sourceType, content: input.content });
      },
      searchSemantic: async () => [{
        id: "hit",
        projectId: "proj-1",
        sourceType: "conversation",
        content: "summary",
        score: 1,
        metadata: {},
      }] satisfies RagResult[],
    });

    await manager.persistCompact("proj-1", "conv-1", {
      summary: "Earlier work on auth",
      decisions: ["chose cookie sessions"],
      currentState: "Fix login · tool_call · gpt-test",
      filesChanged: ["src/auth.ts"],
      unresolvedIssues: [],
      keptMessages: [],
    });

    expect(structured.map((item) => item.memoryType)).toEqual(["summary", "decision", "task_state"]);
    expect(semantic).toEqual([
      { sourceType: "conversation", content: expect.stringContaining("Earlier work on auth") },
    ]);
    await expect(manager.searchStructured("proj-1", "auth")).resolves.toHaveLength(3);
    await expect(manager.searchSemantic("proj-1", "auth")).resolves.toHaveLength(1);
  });

  it("delegates saveStructured without creating a second store", async () => {
    const saveStructured = vi.fn(async () => undefined);
    const manager = new MemoryManager({
      saveStructured,
      searchStructured: async () => [],
      indexSemantic: async () => undefined,
      searchSemantic: async () => [],
    });
    await manager.saveStructured({
      id: "m1",
      projectId: "proj-1",
      memoryType: "fact",
      content: "uses zustand",
    });
    expect(saveStructured).toHaveBeenCalledTimes(1);
    expect(saveStructured.mock.calls[0]?.[0]).toMatchObject({
      id: "m1",
      memoryType: "fact",
      content: "uses zustand",
    });
  });
});
