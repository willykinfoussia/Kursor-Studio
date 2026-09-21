import { describe, expect, it } from "vitest";
import { redactValue, looksLikeSecret, truncateOutput } from "../redact";

describe("MCP redact", () => {
  it("strips secret keys and tokens from payloads", () => {
    expect(looksLikeSecret("ghp_abc")).toBe(true);
    expect(redactValue({ GITHUB_TOKEN: "ghp_abc", query: "issues" })).toEqual({
      GITHUB_TOKEN: "[redacted]",
      query: "issues",
    });
    const clipped = truncateOutput("abcdefghij", 4);
    expect(clipped.truncated).toBe(true);
    expect(clipped.text).toContain("[output truncated]");
  });
});
