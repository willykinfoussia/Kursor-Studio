import { describe, expect, it } from "vitest";
import { approvalHeadline } from "../approvalCopy";
import type { ApprovalRequest } from "../../permissions/types";

const base: ApprovalRequest = {
  id: "p1",
  tool: "run_command",
  input: { command: "pnpm test" },
  reason: "run tests",
  riskLevel: "high",
  capability: "terminal.execute",
  scope: { kind: "project" },
  mode: "workspace-write",
};

describe("approvalHeadline", () => {
  it("describes commands, deletes, git and outside-project writes", () => {
    expect(approvalHeadline(base)).toBe("Kursor wants to run this command");
    expect(approvalHeadline({ ...base, tool: "delete_file", capability: "filesystem.delete" })).toBe("Kursor wants to delete files");
    expect(approvalHeadline({ ...base, tool: "git_commit", capability: "git.write" })).toBe("Kursor wants to commit changes");
    expect(approvalHeadline({ ...base, tool: "git_push", capability: "git.write" })).toBe("Kursor wants to push to the remote");
    expect(approvalHeadline({ ...base, tool: "git_pull", capability: "git.write" })).toBe("Kursor wants to pull from the remote");
    expect(approvalHeadline({ ...base, tool: "git_fetch", capability: "git.write" })).toBe("Kursor wants to fetch from the remote");
    expect(approvalHeadline({ ...base, tool: "write_file", capability: "filesystem.write" }, true)).toBe("Kursor wants to modify a file outside the project");
  });
});
