import { describe, expect, it, vi } from "vitest";
import { WebFetchService } from "../WebFetchService";
import { idleToolContext } from "../../tools/result";
import { createFetchUrlTool } from "../../tools/networkTools";

function jsonResponse(body: string, init: { status?: number; url?: string; headers?: Record<string, string> } = {}) {
  return {
    status: init.status ?? 200,
    url: init.url ?? "https://example.com",
    headers: {
      get(name: string) {
        const headers = init.headers ?? {};
        return headers[name] ?? headers[name.toLowerCase()] ?? null;
      },
    },
    text: async () => body,
  } as Response;
}

describe("WebFetchService", () => {
  it("clips oversized bodies and reads a title", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(`<title>Docs</title>${"x".repeat(80)}`, {
      headers: { "content-type": "text/html" },
    }));
    const service = new WebFetchService(fetchImpl);
    const result = await service.fetch("https://example.com", {
      signal: new AbortController().signal,
      maxChars: 20,
    });
    expect(result.title).toBe("Docs");
    expect(result.body).toHaveLength(20);
    expect(fetchImpl).toHaveBeenCalledWith("https://example.com/", expect.objectContaining({ redirect: "manual" }));
  });

  it("rejects a redirect to a private host", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse("", {
      status: 302,
      headers: { Location: "https://127.0.0.1/secret" },
    }));
    const service = new WebFetchService(fetchImpl);
    await expect(service.fetch("https://example.com", {
      signal: new AbortController().signal,
    })).rejects.toThrow(/not allowed/i);
  });

  it("stops after the redirect cap", async () => {
    const fetchImpl = vi.fn(async (url: string) => jsonResponse("", {
      status: 302,
      url,
      headers: { Location: "https://example.com/next" },
    }));
    const service = new WebFetchService(fetchImpl);
    await expect(service.fetch("https://example.com/start", {
      signal: new AbortController().signal,
      maxRedirects: 1,
    })).rejects.toThrow(/too many redirects/i);
  });
});

describe("fetch_url tool", () => {
  it("delegates to WebFetchService", async () => {
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

  it("rejects a missing url", async () => {
    const fetch = { fetch: vi.fn() };
    const result = await createFetchUrlTool({ fetch }).execute({ url: "" }, idleToolContext());
    expect(result.error?.code).toBe("invalid_input");
    expect(fetch.fetch).not.toHaveBeenCalled();
  });
});
