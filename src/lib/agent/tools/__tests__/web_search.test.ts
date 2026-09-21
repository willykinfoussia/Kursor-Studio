import { describe, expect, it, vi } from "vitest";
import { parseDuckDuckGoResults } from "../networkTools";
import { createWebSearchTool } from "../networkTools";
import { idleToolContext } from "../result";

describe("web_search", () => {
  it("parses titles and https urls", () => {
    const html = `
      <a rel="nofollow" class="result__a" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fexample.com%2Fdocs">Example Docs</a>
    `;
    expect(parseDuckDuckGoResults(html)).toEqual([
      { title: "Example Docs", url: "https://example.com/docs", snippet: "" },
    ]);
  });

  it("searches and returns results", async () => {
    const search = {
      search: vi.fn(async () => [{ title: "Hello", url: "https://example.com", snippet: "" }]),
    };
    const result = await createWebSearchTool({ search }).execute({ query: "kursor" }, idleToolContext());
    expect(result.success).toBe(true);
    expect((result.data as { results: unknown[] }).results).toHaveLength(1);
  });

  it("rejects an empty query", async () => {
    const search = { search: vi.fn() };
    const result = await createWebSearchTool({ search }).execute({ query: " " }, idleToolContext());
    expect(result.error?.code).toBe("invalid_input");
  });
});
