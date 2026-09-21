import { describe, expect, it, vi } from "vitest";
import { createGitCommitTool, createGitFetchTool, createGitPullTool, createGitPushTool } from "../gitTools";
import type { AgentGitService } from "../native";
import { idleToolContext } from "../result";

function mockGit(overrides: Partial<AgentGitService> = {}): AgentGitService {
  return {
    status: vi.fn(async () => ({ branch: "main", changedFiles: [], clean: true })),
    diff: vi.fn(async () => ({ diff: "" })),
    commit: vi.fn(async ({ push }) => ({ committed: true, pushed: Boolean(push) })),
    push: vi.fn(async () => undefined),
    pull: vi.fn(async () => undefined),
    fetch: vi.fn(async () => undefined),
    checkout: vi.fn(async () => undefined),
    createBranch: vi.fn(async () => undefined),
    ...overrides,
  };
}

describe("git_commit", () => {
  it("commits selected paths and can push", async () => {
    const git = mockGit();
    const result = await createGitCommitTool({ git }).execute(
      { message: "feat: init", paths: ["README.md"], push: true },
      idleToolContext(),
    );
    expect(result.success).toBe(true);
    expect(git.commit).toHaveBeenCalledWith({ message: "feat: init", paths: ["README.md"], push: true });
    expect(createGitCommitTool({ git }).capability).toBe("git.write");
    expect(createGitCommitTool({ git }).approval).toBe("ask");
  });

  it("requires a project and a message", async () => {
    const git = mockGit();
    const tool = createGitCommitTool({ git });
    expect((await tool.execute({ message: "feat: init" }, idleToolContext(null))).error?.code).toBe("no_project");
    expect((await tool.execute({ message: "  " }, idleToolContext())).error?.code).toBe("invalid_input");
  });

  it("rejects path traversal", async () => {
    const git = mockGit();
    const result = await createGitCommitTool({ git }).execute(
      { message: "feat: init", paths: ["../secret"] },
      idleToolContext(),
    );
    expect(result.error?.code).toBe("path_outside_project");
  });

  it("accepts a directory path with a trailing slash", async () => {
    const git = mockGit();
    const result = await createGitCommitTool({ git }).execute(
      { message: "feat: init", paths: ["src/"] },
      idleToolContext(),
    );
    expect(result.success).toBe(true);
    expect(git.commit).toHaveBeenCalledWith({ message: "feat: init", paths: ["src"], push: false });
  });
});

describe("git remote tools", () => {
  it("pushes, pulls, and fetches through the git service", async () => {
    const git = mockGit();
    expect((await createGitPushTool({ git }).execute({}, idleToolContext())).success).toBe(true);
    expect(git.push).toHaveBeenCalled();
    expect((await createGitPullTool({ git }).execute({}, idleToolContext())).success).toBe(true);
    expect(git.pull).toHaveBeenCalled();
    expect((await createGitFetchTool({ git }).execute({}, idleToolContext())).success).toBe(true);
    expect(git.fetch).toHaveBeenCalled();
  });

  it("requires an open project", async () => {
    const git = mockGit();
    expect((await createGitPushTool({ git }).execute({}, idleToolContext(null))).error?.code).toBe("no_project");
    expect(createGitPushTool({ git }).capability).toBe("git.write");
  });

  it("creates a branch before pushing from detached HEAD", async () => {
    const git = mockGit({
      status: vi.fn(async () => ({ branch: "HEAD", changedFiles: [], clean: false })),
    });
    const result = await createGitPushTool({ git }).execute({ branch: "fitness-tracker-app" }, idleToolContext());
    expect(result.success).toBe(true);
    expect(git.createBranch).toHaveBeenCalledWith("fitness-tracker-app");
    expect(git.push).toHaveBeenCalled();
  });
});
