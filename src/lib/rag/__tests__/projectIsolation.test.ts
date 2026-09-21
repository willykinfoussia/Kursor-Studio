import { describe, expect, it } from "vitest";
import { mergeResults } from "../Retriever";
import type { RagResult } from "../types";

function hit(projectId: string, id: string, content: string): RagResult {
  return {
    id,
    projectId,
    sourceType: "file",
    sourcePath: `${projectId}/auth.ts`,
    content,
    score: 1,
    metadata: {},
  };
}

describe("RAG project isolation", () => {
  it("never mixes project B hits into a project A result set", () => {
    const projectA = [hit("proj-a", "a1", "JWT authentication")];
    const merged = mergeResults(projectA, [], "authentication", 8);
    expect(merged.every((item) => item.projectId === "proj-a")).toBe(true);
    expect(merged.some((item) => item.projectId === "proj-b")).toBe(false);
  });
});
