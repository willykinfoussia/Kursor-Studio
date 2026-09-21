import { describe, expect, it, vi } from "vitest";
import { parseDuckDuckGoResults } from "../providers/duckduckgo";
import { WebSearchService } from "../WebSearchService";
import { createWebSearchTool } from "../../tools/networkTools";
import { idleToolContext } from "../../tools/result";

describe("parseDuckDuckGoResults", () => {
  it("parses titles, https urls, and snippets", () => {
    const html = `
      <a rel="nofollow" class="result__a" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fexample.com%2Fdocs">Example Docs</a>
      <a class="result__snippet">Latest API notes</a>
    `;
    expect(parseDuckDuckGoResults(html)).toEqual([
      { title: "Example Docs", url: "https://example.com/docs", snippet: "Latest API notes" },
    ]);
  });
});

describe("WebSearchService", () => {
  it("rejects an empty query and caps results", async () => {
    const provider = {
      id: "fake",
      search: vi.fn(async () => [
        { title: "One", url: "https://a.example", snippet: "" },
        { title: "Two", url: "https://b.example", snippet: "" },
      ]),
    };
    const service = new WebSearchService(provider);
    await expect(service.search(" ", { signal: new AbortController().signal })).rejects.toThrow(/query/i);
    const hits = await service.search("kursor", { signal: new AbortController().signal, maxResults: 1 });
    expect(hits).toHaveLength(1);
    expect(provider.search).toHaveBeenCalled();
  });
});

describe("web_search tool", () => {
  it("delegates to WebSearchService", async () => {
    const search = {
      search: vi.fn(async () => [{ title: "Hello", url: "https://example.com", snippet: "Hi" }]),
    };
    const result = await createWebSearchTool({ search }).execute({ query: "kursor" }, idleToolContext());
    expect(result.success).toBe(true);
    expect((result.data as { results: unknown[] }).results).toHaveLength(1);
  });

  it("rejects an empty query", async () => {
    const search = { search: vi.fn() };
    const result = await createWebSearchTool({ search }).execute({ query: " " }, idleToolContext());
    expect(result.error?.code).toBe("invalid_input");
    expect(search.search).not.toHaveBeenCalled();
  });
});
