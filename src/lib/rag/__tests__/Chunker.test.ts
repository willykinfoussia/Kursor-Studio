import { describe, expect, it } from "vitest";
import { LineBlockChunker } from "../Chunker";
import { mergeResults } from "../Retriever";

describe("chunker", () => {
  it("splits long files into overlapping line blocks", () => {
    const content = Array.from({ length: 250 }, (_, index) => `line-${index}`).join("\n");
    const chunks = new LineBlockChunker().chunk(content, { projectId: "p", path: "src/a.ts" });
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks[0]?.startLine).toBe(1);
    expect(chunks[1]?.startLine).toBeLessThan(chunks[0]!.endLine);
  });
});

describe("retriever", () => {
  it("merges vector and keyword hits and prefers higher scores", () => {
    const merged = mergeResults(
      [{ id: "a", projectId: "p", sourceType: "code", content: "todo", score: 0.4, metadata: {} }],
      [{ id: "b", projectId: "p", sourceType: "code", sourcePath: "src/todo.ts", content: "list", score: 0.2, metadata: {} }],
      "todo",
      5,
    );
    expect(merged.map((item) => item.id)).toContain("a");
    expect(merged.map((item) => item.id)).toContain("b");
    const pathHit = merged.find((item) => item.id === "b");
    expect((pathHit?.score ?? 0) > 0.2).toBe(true);
  });
});
