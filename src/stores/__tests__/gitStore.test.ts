import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { reconnectGitHub } = vi.hoisted(() => ({
  reconnectGitHub: vi.fn(async () => true),
}));

vi.mock("../../lib/github/ensureRepository", () => ({
  reconnectGitHub,
  ensureGitHubRepository: vi.fn(async () => undefined),
  refreshGitStatus: vi.fn(async () => undefined),
}));

import { gitService } from "../../lib/git/GitService";
import { useGitStore } from "../gitStore";
import type { GitStatus } from "../../types/tauri";

const changed: GitStatus = {
  branch: "main",
  changedFiles: ["README.md"],
  clean: false,
  ahead: 0,
  behind: 0,
  stagedFiles: 0,
  files: [{
    path: "README.md",
    index: "?",
    worktree: "?",
    kind: "U",
    additions: 1,
    deletions: 0,
    staged: false,
    unstaged: true,
    binary: false,
  }],
};

describe("gitStore commit", () => {
  beforeEach(() => {
    vi.spyOn(gitService, "unstagePaths").mockResolvedValue(undefined);
    vi.spyOn(gitService, "addPaths").mockResolvedValue(undefined);
    vi.spyOn(gitService, "commit").mockResolvedValue(undefined);
    vi.spyOn(gitService, "push").mockResolvedValue(undefined);
    vi.spyOn(gitService, "isRepo").mockResolvedValue(true);
    vi.spyOn(gitService, "status").mockResolvedValue({
      branch: "main",
      changedFiles: [],
      clean: true,
      ahead: 1,
      behind: 0,
      stagedFiles: 0,
      files: [],
    });
    vi.spyOn(gitService, "remotes").mockResolvedValue([{ name: "origin", url: "https://github.com/acme/app.git" }]);
    vi.spyOn(gitService, "branchDetails").mockResolvedValue([]);
    vi.spyOn(gitService, "lastFetch").mockResolvedValue(null);
    reconnectGitHub.mockReset();
    reconnectGitHub.mockResolvedValue(true);
    useGitStore.setState({
      busy: false,
      error: null,
      summary: "feat: init",
      description: "",
      selectedPaths: ["README.md"],
      remotes: [{ name: "origin", url: "https://github.com/acme/app.git" }],
      commitAction: "commitPush",
      status: changed,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("commits and pushes when commitAction is commitPush", async () => {
    await useGitStore.getState().commit();
    expect(gitService.addPaths).toHaveBeenCalledWith(["README.md"]);
    expect(gitService.commit).toHaveBeenCalledWith("feat: init", "");
    expect(gitService.push).toHaveBeenCalled();
    expect(useGitStore.getState().summary).toBe("");
  });

  it("commits locally when commitAction is commit", async () => {
    useGitStore.setState({ commitAction: "commit" });
    await useGitStore.getState().commit();
    expect(gitService.commit).toHaveBeenCalled();
    expect(gitService.push).not.toHaveBeenCalled();
  });

  it("does not push when there is no remote", async () => {
    useGitStore.setState({ remotes: [], commitAction: "commitPush" });
    await useGitStore.getState().commit();
    expect(gitService.commit).toHaveBeenCalled();
    expect(gitService.push).not.toHaveBeenCalled();
  });

  it("retries push after an auth failure when the GitHub session is already valid", async () => {
    vi.mocked(gitService.push)
      .mockRejectedValueOnce(new Error("Git authentication failed."))
      .mockResolvedValueOnce(undefined);
    await useGitStore.getState().push();
    expect(reconnectGitHub).toHaveBeenCalledTimes(1);
    expect(gitService.push).toHaveBeenCalledTimes(2);
    expect(useGitStore.getState().error).toBeNull();
  });

  it("reconnects GitHub and retries push after commit-and-push auth failure", async () => {
    vi.mocked(gitService.push)
      .mockRejectedValueOnce(new Error("remote: Invalid credentials\nfatal: Authentication failed"))
      .mockResolvedValueOnce(undefined);
    await useGitStore.getState().commit();
    expect(reconnectGitHub).toHaveBeenCalledTimes(1);
    expect(gitService.push).toHaveBeenCalledTimes(2);
    expect(useGitStore.getState().error).toBeNull();
  });

  it("does not reconnect when push fails for a non-auth reason", async () => {
    vi.mocked(gitService.push).mockRejectedValueOnce(new Error("rejected non-fast-forward"));
    await useGitStore.getState().push();
    expect(reconnectGitHub).not.toHaveBeenCalled();
    expect(useGitStore.getState().error).toBe("rejected non-fast-forward");
  });
});
