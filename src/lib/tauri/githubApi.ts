import { invokeCommand } from "./invoke";

export interface GitHubUser {
  id: string;
  login: string;
  name?: string | null;
  avatarUrl?: string | null;
  email?: string | null;
}

export interface GitHubRepository {
  id: string;
  name: string;
  fullName: string;
  owner: string;
  htmlUrl: string;
  cloneUrl: string;
  defaultBranch: string;
  private: boolean;
  description?: string | null;
}

export interface GitHubIssue {
  id: string;
  number: number;
  title: string;
  state: string;
  htmlUrl: string;
}

export interface GitHubPull {
  id: string;
  number: number;
  title: string;
  state: string;
  htmlUrl: string;
  head: string;
  base: string;
}

export interface GitHubRelease {
  id: string;
  tagName: string;
  name: string;
  htmlUrl: string;
  draft: boolean;
}

export interface GitRemote {
  name: string;
  url: string;
}

export interface GitMergeResult {
  merged: boolean;
  inProgress: boolean;
  conflicts: string[];
  message: string;
}

export const githubApi = {
  signIn: () => invokeCommand<GitHubUser>("github_sign_in"),
  signOut: () => invokeCommand<void>("github_sign_out"),
  currentUser: () => invokeCommand<GitHubUser | null>("github_current_user", undefined, null),
  isAuthenticated: () => invokeCommand<boolean>("github_is_authenticated", undefined, false),
  listRepositories: (query?: string) =>
    invokeCommand<GitHubRepository[]>("github_list_repositories", { query }, []),
  getRepository: (owner: string, name: string) =>
    invokeCommand<GitHubRepository>("github_get_repository", { owner, name }),
  createRepository: (name: string, privateRepo = true) =>
    invokeCommand<GitHubRepository>("github_create_repository", { name, private: privateRepo }),
  listIssues: (owner: string, repo: string) =>
    invokeCommand<GitHubIssue[]>("github_list_issues", { owner, repo }, []),
  createIssue: (owner: string, repo: string, title: string, body?: string) =>
    invokeCommand<GitHubIssue>("github_create_issue", { owner, repo, title, body }),
  listPulls: (owner: string, repo: string) =>
    invokeCommand<GitHubPull[]>("github_list_pulls", { owner, repo }, []),
  createPull: (owner: string, repo: string, title: string, head: string, base: string, body?: string) =>
    invokeCommand<GitHubPull>("github_create_pull", { owner, repo, title, head, base, body }),
  listReleases: (owner: string, repo: string) =>
    invokeCommand<GitHubRelease[]>("github_list_releases", { owner, repo }, []),
  createRelease: (owner: string, repo: string, tag: string, name?: string, body?: string) =>
    invokeCommand<GitHubRelease>("github_create_release", { owner, repo, tag, name, body }),
};

export const gitApi = {
  remotes: () => invokeCommand<GitRemote[]>("project_git_remotes", undefined, []),
  init: () => invokeCommand<void>("project_git_init"),
  addRemote: (name: string, url: string) =>
    invokeCommand<void>("project_git_add_remote", { name, url }),
  clone: (url: string, dest: string) => invokeCommand<void>("project_git_clone", { url, dest }),
  createFolder: (path: string) => invokeCommand<void>("project_create_folder", { path }),
  add: () => invokeCommand<void>("project_git_add"),
  addPaths: (paths: string[]) => invokeCommand<void>("project_git_add_paths", { paths }),
  unstagePaths: (paths: string[]) => invokeCommand<void>("project_git_unstage_paths", { paths }),
  discardPaths: (paths: string[]) => invokeCommand<void>("project_git_discard_paths", { paths }),
  applyPatch: (patch: string, cached = false, reverse = false) =>
    invokeCommand<void>("project_git_apply_patch", { patch, cached, reverse }),
  commit: (message: string) => invokeCommand<void>("project_git_commit", { message }),
  push: () => invokeCommand<void>("project_git_push"),
  pull: () => invokeCommand<void>("project_git_pull"),
  fetch: () => invokeCommand<void>("project_git_fetch"),
  branches: () => invokeCommand<string[]>("project_git_branch_list", undefined, []),
  checkout: (branch: string) => invokeCommand<void>("project_git_checkout", { branch }),
  createBranch: (branch: string, start?: string) =>
    invokeCommand<void>("project_git_create_branch", { branch, start }),
  deleteBranch: (branch: string, force = false) =>
    invokeCommand<void>("project_git_delete_branch", { branch, force }),
  merge: (branch: string) =>
    invokeCommand<GitMergeResult>("project_git_merge", { branch }),
  mergeContinue: () => invokeCommand<GitMergeResult>("project_git_merge_continue"),
  mergeAbort: () => invokeCommand<void>("project_git_merge_abort"),
  rebase: (branch: string) => invokeCommand<void>("project_git_rebase", { branch }),
  cherryPick: (sha: string) => invokeCommand<void>("project_git_cherry_pick", { sha }),
  revert: (sha: string) => invokeCommand<void>("project_git_revert", { sha }),
  reset: (sha: string, mode: "soft" | "mixed" | "hard" = "mixed") =>
    invokeCommand<void>("project_git_reset", { sha, mode }),
  dropCommit: (sha: string) => invokeCommand<void>("project_git_drop_commit", { sha }),
  hasCommits: () => invokeCommand<boolean>("project_git_has_commits", undefined, false),
};
