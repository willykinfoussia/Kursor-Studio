import { describe, expect, it } from "vitest";
import { WebSource } from "../sources/web";
import type { ContextSnapshot } from "../types";
import type { AgentMessage } from "../../types";

function snapshot(partial: Partial<ContextSnapshot> = {}): ContextSnapshot {
  const request = partial.request ?? "docs";
  const message: AgentMessage = { id: "u1", role: "user", content: request, timestamp: 1 };
  return {
    request,
    messages: [message],
    project: { id: "p1", name: "App", rootPath: "C:/Projects/App" },
    currentFile: null,
    openFiles: [],
    toolCalls: [],
    webDocuments: [],
    activeTask: null,
    maxContextChars: 6_000,
    ...partial,
  };
}

describe("WebSource", () => {
  it("emits slices with title, url, and retrievedAt", async () => {
    const source = new WebSource();
    const result = await source.collect(snapshot({
      webDocuments: [{
        title: "Example Docs",
        url: "https://example.com/docs",
        snippet: "Latest API",
        content: "body",
        retrievedAt: 42,
      }],
    }), {
      maxTokens: 50_000,
      maxFileChars: 6_000,
      maxFiles: 8,
      maxRagChunks: 6,
      maxHistoryMessages: 30,
      maxWebDocs: 6,
      maxGraphFiles: 8,
    });

    expect(result.slices).toHaveLength(1);
    expect(result.slices[0]?.meta).toEqual({
      title: "Example Docs",
      url: "https://example.com/docs",
      retrievedAt: "42",
    });
    expect(result.slices[0]?.text).toContain("https://example.com/docs");
    expect(result.slices[0]?.text).toContain("Example Docs");
  });

  it("skips when there are no documents", async () => {
    const source = new WebSource();
    const result = await source.collect(snapshot(), {
      maxTokens: 50_000,
      maxFileChars: 6_000,
      maxFiles: 8,
      maxRagChunks: 6,
      maxHistoryMessages: 30,
      maxWebDocs: 6,
      maxGraphFiles: 8,
    });
    expect(result.slices).toEqual([]);
    expect(result.skipReason).toBe("no web documents");
  });
});
