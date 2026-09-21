import { describe, expect, it } from "vitest";
import { accountPromptContext } from "../AccountContext";

describe("AccountContext", () => {
  it("never includes tokens or secrets", () => {
    const text = accountPromptContext({
      id: "local-account",
      provider: "github",
      username: "willy",
      displayName: "Willy",
      onboarded: true,
      createdAt: 1,
      updatedAt: 1,
    });
    expect(text).toContain("Willy");
    expect(text).not.toMatch(/ghp_|sk-|Bearer |access_token|GITHUB_ACCESS_TOKEN/i);
  });
});
