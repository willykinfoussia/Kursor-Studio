import { gitApi, type GitRemote } from "../tauri/githubApi";
import { projectApi } from "../tauri/projectApi";
import type {
  GitBranchInfo,
  GitCommitDetail,
  GitCompare,
  GitDiff,
  GitFileChange,
  GitFileContents,
  GitLogPage,
  GitStatus,
} from "../../types/tauri";

export type { GitRemote, GitBranchInfo, GitCommitDetail, GitCompare, GitDiff, GitFileChange, GitFileContents, GitLogPage, GitStatus };

export interface GitContext {
  status: GitStatus;
  remotes: GitRemote[];
  githubRemote?: GitRemote;
}

function parseGithubRemote(url: string) {
  const match = url.match(/github\.com[:/](.+?)\/(.+?)(?:\.git)?$/i);
  if (!match?.[1] || !match[2]) return null;
  return { owner: match[1], repo: match[2].replace(/\.git$/i, "") };
}

function commitMessage(summary: string, description?: string) {
  const title = summary.trim();
  const body = description?.trim();
  return body ? `${title}\n\n${body}` : title;
}

export const gitService = {
  status: () => projectApi.gitStatus(),
  diff: (path?: string) => projectApi.gitDiff(path),
  diffAt: (input?: { path?: string; staged?: boolean; from?: string; to?: string }) =>
    projectApi.gitDiffAt(input),
  fileContents: (input: { path: string; staged?: boolean; from?: string; to?: string; force?: boolean }) =>
    projectApi.gitFileContents(input),
  isRepo: () => projectApi.gitIsRepo(),
  remotes: () => gitApi.remotes(),
  init: () => gitApi.init(),
  addRemote: (name: string, url: string) => gitApi.addRemote(name, url),
  clone: (url: string, dest: string) => gitApi.clone(url, dest),
  createFolder: (path: string) => gitApi.createFolder(path),
  add: () => gitApi.add(),
  addPaths: (paths: string[]) => gitApi.addPaths(paths),
  unstagePaths: (paths: string[]) => gitApi.unstagePaths(paths),
  discardPaths: (paths: string[]) => gitApi.discardPaths(paths),
  applyPatch: (patch: string, cached = false, reverse = false) => gitApi.applyPatch(patch, cached, reverse),
  async commit(summary: string, description?: string) {
    await gitApi.commit(commitMessage(summary, description));
  },
  async commitAll(summary: string, description?: string) {
    await gitApi.add();
    await gitApi.commit(commitMessage(summary, description));
  },
  push: () => gitApi.push(),
  pull: () => gitApi.pull(),
  fetch: () => gitApi.fetch(),
  branches: () => gitApi.branches(),
  branchDetails: () => projectApi.gitBranchDetails(),
  checkout: (branch: string) => gitApi.checkout(branch),
  createBranch: (branch: string, start?: string) => gitApi.createBranch(branch, start),
  deleteBranch: (branch: string, force = false) => gitApi.deleteBranch(branch, force),
  merge: (branch: string) => gitApi.merge(branch),
  rebase: (branch: string) => gitApi.rebase(branch),
  cherryPick: (sha: string) => gitApi.cherryPick(sha),
  revert: (sha: string) => gitApi.revert(sha),
  reset: (sha: string, mode: "soft" | "mixed" | "hard" = "mixed") => gitApi.reset(sha, mode),
  dropCommit: (sha: string) => gitApi.dropCommit(sha),
  log: (skip = 0, limit = 200, options?: { all?: boolean }) =>
    projectApi.gitLog(skip, limit, options?.all ?? false),
  commitDetail: (sha: string) => projectApi.gitCommitDetail(sha),
  compare: (from: string, to: string) => projectApi.gitCompare(from, to),
  lastFetch: () => projectApi.gitLastFetch(),
  hasCommits: () => gitApi.hasCommits(),
  parseGithubRemote,
  files(status: GitStatus | null | undefined): GitFileChange[] {
    return status?.files ?? (status?.changedFiles ?? []).map((path) => ({
      path,
      index: " ",
      worktree: "M",
      kind: "M",
      additions: 0,
      deletions: 0,
      staged: false,
      unstaged: true,
      binary: false,
    }));
  },
  async context(): Promise<GitContext | null> {
    try {
      const [status, remotes] = await Promise.all([projectApi.gitStatus(), gitApi.remotes()]);
      const githubRemote = remotes.find((remote) => /github\.com/i.test(remote.url));
      return { status, remotes, githubRemote };
    } catch {
      return null;
    }
  },
};
