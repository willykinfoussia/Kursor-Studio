import { describe, expect, it, vi } from "vitest";
import { createGitDiffTool } from "../gitTools";
import { idleToolContext } from "../result";

describe("git_diff", () => {
  it("returns a bounded diff", async () => {
    const git = {
      status: vi.fn(async () => ({ branch: "main", changedFiles: [], clean: true })),
      diff: vi.fn(async () => ({ path: "src/App.tsx", diff: "-a\n+b" })),
      commit: vi.fn(async () => ({ committed: true as const, pushed: false })),
      push: vi.fn(async () => undefined),
      pull: vi.fn(async () => undefined),
      fetch: vi.fn(async () => undefined),
      checkout: vi.fn(async () => undefined),
      createBranch: vi.fn(async () => undefined),
    };
    const result = await createGitDiffTool({ git }).execute({ path: "src/App.tsx" }, idleToolContext());
    expect(git.diff).toHaveBeenCalledWith("src/App.tsx");
    expect(result.success).toBe(true);
    expect(result.data).toEqual({ path: "src/App.tsx", diff: "-a\n+b" });
  });

  it("rejects path traversal", async () => {
    const git = {
      status: vi.fn(async () => ({ branch: "main", changedFiles: [], clean: true })),
      diff: vi.fn(async () => ({ diff: "" })),
      commit: vi.fn(async () => ({ committed: true as const, pushed: false })),
      push: vi.fn(async () => undefined),
      pull: vi.fn(async () => undefined),
      fetch: vi.fn(async () => undefined),
      checkout: vi.fn(async () => undefined),
      createBranch: vi.fn(async () => undefined),
    };
    const result = await createGitDiffTool({ git }).execute({ path: "../x" }, idleToolContext());
    expect(result.error?.code).toBe("path_outside_project");
  });
});
