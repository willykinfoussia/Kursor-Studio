import { describe, expect, it } from "vitest";
import { sanitizeAgentBranchName } from "../gitBranch";

describe("sanitizeAgentBranchName", () => {
  it("accepts a simple agent branch name", () => {
    expect(sanitizeAgentBranchName("kursor-feat")).toBe("kursor-feat");
    expect(sanitizeAgentBranchName("refs/heads/kursor-feat")).toBe("kursor-feat");
  });

  it("rejects traversal and empty names", () => {
    expect(sanitizeAgentBranchName("")).toBeNull();
    expect(sanitizeAgentBranchName("feat..hack")).toBeNull();
    expect(sanitizeAgentBranchName("feat\\hack")).toBeNull();
    expect(sanitizeAgentBranchName("/feat")).toBeNull();
  });
});
