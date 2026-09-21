import { describe, expect, it, vi } from "vitest";
import { createGitStatusTool } from "../gitTools";
import { idleToolContext } from "../result";

describe("git_status", () => {
  it("returns branch and changed files", async () => {
    const git = {
      status: vi.fn(async () => ({ branch: "main", changedFiles: ["src/App.tsx"], clean: false })),
      diff: vi.fn(async () => ({ diff: "" })),
      commit: vi.fn(async () => ({ committed: true as const, pushed: false })),
      push: vi.fn(async () => undefined),
      pull: vi.fn(async () => undefined),
      fetch: vi.fn(async () => undefined),
      checkout: vi.fn(async () => undefined),
      createBranch: vi.fn(async () => undefined),
    };
    const result = await createGitStatusTool({ git }).execute({}, idleToolContext());
    expect(result.success).toBe(true);
    expect(result.data).toEqual({ branch: "main", changedFiles: ["src/App.tsx"], clean: false });
  });

  it("requires an open project", async () => {
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
    const result = await createGitStatusTool({ git }).execute({}, idleToolContext(null));
    expect(result.error?.code).toBe("no_project");
  });
});
