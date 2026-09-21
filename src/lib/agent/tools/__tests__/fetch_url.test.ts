import { describe, expect, it, vi } from "vitest";
import { assertSafeHttpsUrl } from "../http";
import { createFetchUrlTool } from "../networkTools";
import { idleToolContext } from "../result";

describe("fetch_url", () => {
  it("fetches public https text", async () => {
    const fetch = {
      fetch: vi.fn(async () => ({
        url: "https://example.com",
        status: 200,
        contentType: "text/plain",
        body: "hello",
        title: "example.com",
      })),
    };
    const result = await createFetchUrlTool({ fetch }).execute({ url: "https://example.com" }, idleToolContext());
    expect(result.success).toBe(true);
    expect(fetch.fetch).toHaveBeenCalled();
  });

  it("rejects missing urls and private hosts", async () => {
    const fetch = { fetch: vi.fn(async () => { throw new Error("This host is not allowed."); }) };
    const tool = createFetchUrlTool({ fetch });
    expect((await tool.execute({ url: "" }, idleToolContext())).error?.code).toBe("invalid_input");
    expect(() => assertSafeHttpsUrl("http://example.com")).toThrow();
    expect(() => assertSafeHttpsUrl("https://127.0.0.1/secret")).toThrow();
    expect(() => assertSafeHttpsUrl("https://169.254.169.254/latest")).toThrow();
    const blocked = await tool.execute({ url: "https://localhost" }, idleToolContext());
    expect(blocked.success).toBe(false);
  });
});
