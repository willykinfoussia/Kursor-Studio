import { create } from "zustand";
import { githubApi } from "../lib/tauri/githubApi";
import { gitService, type GitRemote } from "../lib/git/GitService";
import { withGitAuthRetry } from "../lib/git/gitRecovery";
import { detectGitHost, type GitHostProvider } from "../lib/git/providers";
import { layoutCommitGraph, type CommitLane } from "../lib/git/graph/layout";
import { githubService, type GitHubIssue, type GitHubPull, type GitHubRelease, type GitHubUser } from "../lib/github/GitHubService";
import { parseUnifiedPatch, patchForHunk, type DiffHunk, type ParsedPatch } from "../lib/git/patch";
import { gitReviewService } from "../lib/git/GitReviewService";
import type { GitReviewFinding, GitReviewResult } from "../lib/git/review/parseReview";
import { taskManager } from "../lib/agent/tasks";
import { useProjectStore } from "./projectStore";
import { useUiStore } from "./uiStore";
import type {
  GitBranchInfo,
  GitCommitDetail,
  GitCommitInfo,
  GitFileChange,
  GitFileContents,
  GitStatus,
} from "../types/tauri";

export type GitWorkspaceMode = "changes" | "history";
export type GitCommitAction = "commit" | "commitPush" | "commitPushPr";
export type GitDiffLayout = "split" | "unified";
export type GitChangeFilter = "all" | "M" | "A" | "D" | "R" | "U";
export type GitChangeSort = "path" | "status" | "changes";

export interface GitReviewEntry {
  at: number;
  base: string;
  result: GitReviewResult;
}

interface GitState {
  mode: GitWorkspaceMode;
  busy: boolean;
  error: string | null;
  lastFetchAt: number | null;
  hydratedFor: string | null;
  status: GitStatus | null;
  remotes: GitRemote[];
  branches: GitBranchInfo[];
  provider: GitHostProvider | null;
  author: GitHubUser | null;
  selectedPaths: string[];
  activePath: string | null;
  diffMode: "unstaged" | "staged" | "commit";
  diffLayout: GitDiffLayout;
  wordDiff: boolean;
  forceLoadDiff: boolean;
  contents: GitFileContents | null;
  patch: ParsedPatch | null;
  hunks: DiffHunk[];
  summary: string;
  description: string;
  commitAction: GitCommitAction;
  changeQuery: string;
  changeFilter: GitChangeFilter;
  changeSort: GitChangeSort;
  groupByFolder: boolean;
  commits: GitCommitInfo[];
  commitLanes: CommitLane[];
  historyHasMore: boolean;
  historyQuery: string;
  graphCommits: GitCommitInfo[];
  graphLanes: CommitLane[];
  graphHasMore: boolean;
  selectedSha: string | null;
  commitDetail: GitCommitDetail | null;
  commitContents: GitFileContents | null;
  commitActivePath: string | null;
  reviewBase: string;
  reviewStreaming: string;
  review: GitReviewResult | null;
  reviewBusy: boolean;
  recentReviews: GitReviewEntry[];
  issues: GitHubIssue[];
  pulls: GitHubPull[];
  releases: GitHubRelease[];
  setMode: (mode: GitWorkspaceMode) => void;
  setSummary: (summary: string) => void;
  setDescription: (description: string) => void;
  setCommitAction: (action: GitCommitAction) => void;
  setDiffLayout: (layout: GitDiffLayout) => void;
  setWordDiff: (value: boolean) => void;
  setSelectedPaths: (paths: string[]) => void;
  setChangeQuery: (query: string) => void;
  setChangeFilter: (filter: GitChangeFilter) => void;
  setChangeSort: (sort: GitChangeSort) => void;
  setGroupByFolder: (value: boolean) => void;
  setHistoryQuery: (query: string) => void;
  setReviewBase: (base: string) => void;
  hydrate: () => Promise<void>;
  refreshStatus: () => Promise<void>;
  selectFile: (path: string, staged?: boolean) => Promise<void>;
  toggleSelected: (path: string) => void;
  loadDiff: (path: string, options?: { staged?: boolean; from?: string; to?: string; force?: boolean }) => Promise<void>;
  stagePaths: (paths: string[]) => Promise<void>;
  unstagePaths: (paths: string[]) => Promise<void>;
  discardPaths: (paths: string[]) => Promise<void>;
  stageAll: () => Promise<void>;
  unstageAll: () => Promise<void>;
  stageHunk: (hunk: DiffHunk, unstage?: boolean) => Promise<void>;
  commit: () => Promise<void>;
  fetch: () => Promise<void>;
  pull: () => Promise<void>;
  push: () => Promise<void>;
  sync: () => Promise<void>;
  checkout: (branch: string) => Promise<void>;
  createBranch: (name: string, start?: string) => Promise<void>;
  deleteBranch: (name: string, force?: boolean) => Promise<void>;
  mergeBranch: (name: string) => Promise<void>;
  rebaseBranch: (name: string) => Promise<void>;
  loadHistory: (reset?: boolean) => Promise<void>;
  loadGraph: (reset?: boolean) => Promise<void>;
  selectCommit: (sha: string) => Promise<void>;
  selectCommitFile: (path: string) => Promise<void>;
  checkoutCommit: (sha: string) => Promise<void>;
  cherryPick: (sha: string) => Promise<void>;
  revertCommit: (sha: string) => Promise<void>;
  resetTo: (sha: string, mode?: "soft" | "mixed" | "hard") => Promise<void>;
  dropCommit: (sha: string) => Promise<void>;
  createBranchFromCommit: (name: string, sha: string) => Promise<void>;
  loadOverview: () => Promise<void>;
  createPullRequest: () => Promise<void>;
  analyze: () => Promise<void>;
  applyFix: (finding: GitReviewFinding) => Promise<void>;
  createReviewTask: (finding: GitReviewFinding) => Promise<void>;
}

let refreshTimer: ReturnType<typeof setTimeout> | undefined;
let refreshTail = false;

function filesOf(status: GitStatus | null) {
  return gitService.files(status);
}

function syncProjectGit(status: GitStatus | null) {
  useProjectStore.getState().setGitStatus(
    status
      ? {
          branch: status.branch,
          changedFiles: status.changedFiles.length,
          clean: status.clean,
          ahead: status.ahead ?? 0,
          behind: status.behind ?? 0,
        }
      : null,
  );
}

async function run(set: (partial: Partial<GitState>) => void, action: () => Promise<void>) {
  set({ busy: true, error: null });
  try {
    await action();
    useProjectStore.getState().setGitError(null);
    } catch (error) {
    const message = error instanceof Error ? error.message : "Git command failed.";
    set({ error: message });
    useProjectStore.getState().setGitError(message);
  } finally {
    set({ busy: false });
  }
}

export const useGitStore = create<GitState>((set, get) => ({
  mode: "changes",
  busy: false,
  error: null,
  lastFetchAt: null,
  hydratedFor: null,
  status: null,
  remotes: [],
  branches: [],
  provider: null,
  author: null,
  selectedPaths: [],
  activePath: null,
  diffMode: "unstaged",
  diffLayout: "split",
  wordDiff: true,
  forceLoadDiff: false,
  contents: null,
  patch: null,
  hunks: [],
  summary: "",
  description: "",
  commitAction: "commitPush",
  changeQuery: "",
  changeFilter: "all",
  changeSort: "path",
  groupByFolder: true,
  commits: [],
  commitLanes: [],
  historyHasMore: false,
  historyQuery: "",
  graphCommits: [],
  graphLanes: [],
  graphHasMore: false,
  selectedSha: null,
  commitDetail: null,
  commitContents: null,
  commitActivePath: null,
  reviewBase: "main",
  reviewStreaming: "",
  review: null,
  reviewBusy: false,
  recentReviews: [],
  issues: [],
  pulls: [],
  releases: [],
  setMode: (mode) => {
    set({ mode });
    if (mode === "history") {
      void get().loadHistory(true);
      void get().loadGraph(true);
    }
  },
  setSummary: (summary) => set({ summary }),
  setDescription: (description) => set({ description }),
  setCommitAction: (commitAction) => set({ commitAction }),
  setSelectedPaths: (selectedPaths) => set({ selectedPaths }),
  setDiffLayout: (diffLayout) => set({ diffLayout }),
  setWordDiff: (wordDiff) => set({ wordDiff }),
  setChangeQuery: (changeQuery) => set({ changeQuery }),
  setChangeFilter: (changeFilter) => set({ changeFilter }),
  setChangeSort: (changeSort) => set({ changeSort }),
  setGroupByFolder: (groupByFolder) => set({ groupByFolder }),
  setHistoryQuery: (historyQuery) => set({ historyQuery }),
  setReviewBase: (reviewBase) => set({ reviewBase }),
  hydrate: async () => {
    const projectId = useProjectStore.getState().currentProject?.id ?? null;
    if (!projectId) {
      set({
        hydratedFor: null,
        status: null,
        remotes: [],
        branches: [],
        commits: [],
        commitLanes: [],
        graphCommits: [],
        graphLanes: [],
        graphHasMore: false,
      });
      return;
    }
    if (get().hydratedFor !== projectId) {
      set({
        commits: [],
        commitLanes: [],
        historyHasMore: false,
        graphCommits: [],
        graphLanes: [],
        graphHasMore: false,
        selectedSha: null,
        commitDetail: null,
        commitContents: null,
        commitActivePath: null,
      });
    }
    await get().refreshStatus();
    set({ hydratedFor: projectId });
    if (get().mode === "history") {
      void get().loadHistory(true);
      void get().loadGraph(true);
    }
    void githubApi.currentUser().then((author) => set({ author })).catch(() => set({ author: null }));
  },
  refreshStatus: async () => {
    if (refreshTimer) {
      refreshTail = true;
      return;
    }
    await new Promise<void>((resolve) => {
      refreshTimer = setTimeout(() => {
        refreshTimer = undefined;
        resolve();
      }, 80);
    });
    try {
      const isRepo = await gitService.isRepo().catch(() => false);
      if (!isRepo) {
        set({ status: null, remotes: [], branches: [] });
        syncProjectGit(null);
        return;
      }
      const [status, remotes, branches, lastFetchAt] = await Promise.all([
        gitService.status(),
        gitService.remotes().catch(() => [] as GitRemote[]),
        gitService.branchDetails().catch(() => [] as GitBranchInfo[]),
        gitService.lastFetch().catch(() => null),
      ]);
      const githubRemote = remotes.find((remote) => /github\.com/i.test(remote.url)) ?? remotes[0];
      const current = filesOf(status);
      const activePath = get().activePath && current.some((file) => file.path === get().activePath)
        ? get().activePath
        : (current[0]?.path ?? null);
      const defaultBranch = useProjectStore.getState().currentProject?.defaultBranch
        || branches.find((branch) => branch.name === "main" || branch.name === "master")?.name
        || "main";
      const previousSelected = new Set(get().selectedPaths);
      const previousFiles = new Set(filesOf(get().status).map((file) => file.path));
      const selectedPaths = current
        .map((file) => file.path)
        .filter((path) => !previousFiles.has(path) || previousSelected.has(path));
      set({
        status,
        remotes,
        branches,
        lastFetchAt,
        provider: detectGitHost(githubRemote?.url),
        reviewBase: get().reviewBase || defaultBranch,
        selectedPaths,
        activePath,
      });
      syncProjectGit(status);
      if (activePath) void get().loadDiff(activePath, { staged: get().diffMode === "staged" });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to read git status.";
      set({ error: message, status: null });
      syncProjectGit(null);
    } finally {
      if (refreshTail) {
        refreshTail = false;
        void get().refreshStatus();
      }
    }
  },
  selectFile: async (path, staged) => {
    set({ activePath: path, diffMode: staged ? "staged" : "unstaged" });
    await get().loadDiff(path, { staged });
  },
  toggleSelected: (path) => {
    const selected = get().selectedPaths;
    set({
      selectedPaths: selected.includes(path)
        ? selected.filter((item) => item !== path)
        : [...selected, path],
    });
  },
  loadDiff: async (path, options) => {
    try {
      const staged = options?.staged ?? get().diffMode === "staged";
      const [contents, diff] = await Promise.all([
        gitService.fileContents({
          path,
          staged,
          from: options?.from,
          to: options?.to,
          force: options?.force ?? get().forceLoadDiff,
        }),
        gitService.diffAt({ path, staged, from: options?.from, to: options?.to }),
      ]);
      const parsed = parseUnifiedPatch(diff.diff);
      set({
        activePath: path,
        contents,
        patch: parsed[0] ?? null,
        hunks: parsed[0]?.hunks ?? [],
        forceLoadDiff: options?.force ?? false,
      });
    } catch (error) {
      set({ error: error instanceof Error ? error.message : "Unable to load diff." });
    }
  },
  stagePaths: async (paths) => {
    await run(set, async () => {
      await gitService.addPaths(paths);
      await get().refreshStatus();
    });
  },
  unstagePaths: async (paths) => {
    await run(set, async () => {
      await gitService.unstagePaths(paths);
      await get().refreshStatus();
    });
  },
  discardPaths: async (paths) => {
    await run(set, async () => {
      await gitService.discardPaths(paths);
      await get().refreshStatus();
    });
  },
  stageAll: async () => {
    await get().stagePaths(filesOf(get().status).filter((file) => file.unstaged).map((file) => file.path));
  },
  unstageAll: async () => {
    await get().unstagePaths(filesOf(get().status).filter((file) => file.staged).map((file) => file.path));
  },
  stageHunk: async (hunk, unstage = false) => {
    const patch = get().patch;
    if (!patch) return;
    await run(set, async () => {
      await gitService.applyPatch(patchForHunk(patch, hunk), true, unstage);
      const path = get().activePath;
      await get().refreshStatus();
      if (path) await get().loadDiff(path, { staged: get().diffMode === "staged" });
    });
  },
  commit: async () => {
    if (get().busy) return;
    const summary = get().summary.trim();
    const selected = get().selectedPaths;
    if (!summary) {
      set({ error: "Commit summary is required." });
      return;
    }
    if (selected.length === 0) {
      set({ error: "Select at least one file to commit." });
      return;
    }
    await run(set, async () => {
      const unselected = filesOf(get().status)
        .filter((file) => file.staged && !selected.includes(file.path))
        .map((file) => file.path);
      if (unselected.length > 0) await gitService.unstagePaths(unselected);
      await gitService.addPaths(selected);
      await gitService.commit(summary, get().description);
      const action = get().commitAction;
      const hasRemote = get().remotes.length > 0;
      let remoteError: unknown;
      if (hasRemote && (action === "commitPush" || action === "commitPushPr")) {
        try {
          await withGitAuthRetry(() => gitService.push());
        } catch (error) {
          remoteError = error;
        }
      }
      await get().refreshStatus();
      if (!remoteError && hasRemote && action === "commitPushPr") {
        await get().createPullRequest();
      }
      set({ summary: "", description: "" });
      if (remoteError) throw remoteError;
    });
  },
  fetch: async () => {
    await run(set, async () => {
      await withGitAuthRetry(() => gitService.fetch());
      set({ lastFetchAt: Date.now() });
      await get().refreshStatus();
    });
  },
  pull: async () => {
    await run(set, async () => {
      await withGitAuthRetry(() => gitService.pull());
      await get().refreshStatus();
    });
  },
  push: async () => {
    await run(set, async () => {
      await withGitAuthRetry(() => gitService.push());
      await get().refreshStatus();
    });
  },
  sync: async () => {
    await run(set, async () => {
      await withGitAuthRetry(async () => {
        await gitService.fetch();
        await gitService.pull();
        await gitService.push();
      });
      set({ lastFetchAt: Date.now() });
      await get().refreshStatus();
    });
  },
  checkout: async (branch) => {
    await run(set, async () => {
      await gitService.checkout(branch);
      await get().refreshStatus();
    });
  },
  createBranch: async (name, start) => {
    await run(set, async () => {
      await gitService.createBranch(name, start);
      await get().refreshStatus();
    });
  },
  deleteBranch: async (name, force) => {
    await run(set, async () => {
      await gitService.deleteBranch(name, force);
      await get().refreshStatus();
    });
  },
  mergeBranch: async (name) => {
    await run(set, async () => {
      const result = await gitService.merge(name);
      if (result && "merged" in result && result.merged === false) {
        throw new Error(result.message || "Merge conflicts.");
      }
      await get().refreshStatus();
    });
  },
  rebaseBranch: async (name) => {
    await run(set, async () => {
      await gitService.rebase(name);
      await get().refreshStatus();
    });
  },
  loadHistory: async (reset = false) => {
    const skip = reset ? 0 : get().commits.length;
    try {
      const page = await gitService.log(skip, 200);
      const commits = reset ? page.commits : [...get().commits, ...page.commits];
      set({
        commits,
        commitLanes: layoutCommitGraph(commits),
        historyHasMore: page.hasMore,
        selectedSha: get().selectedSha ?? page.commits[0]?.sha ?? null,
      });
      const sha = get().selectedSha ?? page.commits[0]?.sha;
      if (reset && sha) await get().selectCommit(sha);
    } catch (error) {
      set({ error: error instanceof Error ? error.message : "Unable to load history." });
    }
  },
  loadGraph: async (reset = false) => {
    const skip = reset ? 0 : get().graphCommits.length;
    try {
      const page = await gitService.log(skip, 200, { all: true });
      const graphCommits = reset ? page.commits : [...get().graphCommits, ...page.commits];
      set({
        graphCommits,
        graphLanes: layoutCommitGraph(graphCommits),
        graphHasMore: page.hasMore,
        selectedSha: get().selectedSha ?? page.commits[0]?.sha ?? null,
      });
      const sha = get().selectedSha ?? page.commits[0]?.sha;
      if (reset && sha) await get().selectCommit(sha);
    } catch (error) {
      set({ error: error instanceof Error ? error.message : "Unable to load graph." });
    }
  },
  selectCommit: async (sha) => {
    set({ selectedSha: sha, commitActivePath: null, commitContents: null });
    try {
      const detail = await gitService.commitDetail(sha);
      set({ commitDetail: detail, commitActivePath: detail.files[0]?.path ?? null });
      if (detail.files[0]?.path) await get().selectCommitFile(detail.files[0].path);
    } catch (error) {
      set({ error: error instanceof Error ? error.message : "Unable to load commit." });
    }
  },
  selectCommitFile: async (path) => {
    const sha = get().selectedSha;
    if (!sha) return;
    set({ commitActivePath: path });
    try {
      const parent =
        get().commits.find((item) => item.sha === sha)?.parents[0]
        ?? get().graphCommits.find((item) => item.sha === sha)?.parents[0];
      const contents = await gitService.fileContents({
        path,
        from: parent || `${sha}^`,
        to: sha,
      });
      set({ commitContents: contents });
    } catch (error) {
      set({ error: error instanceof Error ? error.message : "Unable to load commit file." });
    }
  },
  checkoutCommit: async (sha) => {
    await run(set, async () => {
      await gitService.checkout(sha);
      await get().refreshStatus();
    });
  },
  cherryPick: async (sha) => {
    await run(set, async () => {
      await gitService.cherryPick(sha);
      await get().refreshStatus();
      await get().loadHistory(true);
      if (get().graphCommits.length > 0 || get().mode === "history") await get().loadGraph(true);
    });
  },
  revertCommit: async (sha) => {
    await run(set, async () => {
      await gitService.revert(sha);
      await get().refreshStatus();
      await get().loadHistory(true);
      if (get().graphCommits.length > 0 || get().mode === "history") await get().loadGraph(true);
    });
  },
  resetTo: async (sha, mode = "mixed") => {
    await run(set, async () => {
      await gitService.reset(sha, mode);
      await get().refreshStatus();
      await get().loadHistory(true);
      if (get().graphCommits.length > 0 || get().mode === "history") await get().loadGraph(true);
    });
  },
  dropCommit: async (sha) => {
    await run(set, async () => {
      await gitService.dropCommit(sha);
      await get().refreshStatus();
      await get().loadHistory(true);
      if (get().graphCommits.length > 0 || get().mode === "history") await get().loadGraph(true);
    });
  },
  createBranchFromCommit: async (name, sha) => {
    await get().createBranch(name, sha);
  },
  loadOverview: async () => {
    await get().refreshStatus();
    if (get().commits.length === 0) await get().loadHistory(true);
    const project = useProjectStore.getState().currentProject;
    const owner = project?.githubOwner;
    const repo = project?.githubRepo;
    if (!owner || !repo) {
      set({ issues: [], pulls: [], releases: [] });
      return;
    }
    const [issues, pulls, releases] = await Promise.all([
      githubService.listIssues(owner, repo).catch(() => []),
      githubService.listPulls(owner, repo).catch(() => []),
      githubService.listReleases(owner, repo).catch(() => []),
    ]);
    set({ issues, pulls, releases });
  },
  createPullRequest: async () => {
    const project = useProjectStore.getState().currentProject;
    const owner = project?.githubOwner;
    const repo = project?.githubRepo;
    const head = get().status?.branch;
    const base = project?.defaultBranch || get().reviewBase || "main";
    if (!owner || !repo || !head) {
      set({ error: "Link a GitHub repository before creating a pull request." });
      return;
    }
    const title = get().summary.trim() || `${head}`;
    const pull = await githubService.createPull(owner, repo, title, head, base, get().description.trim() || undefined);
    set({ pulls: [pull, ...get().pulls] });
  },
  analyze: async () => {
    set({ reviewBusy: true, reviewStreaming: "", error: null });
    try {
      const files = filesOf(get().status).map((file) => file.path);
      const result = await gitReviewService.analyze(get().reviewBase, files, (text) => {
        set({ reviewStreaming: get().reviewStreaming + text });
      });
      set({
        review: result,
        reviewBusy: false,
        recentReviews: [{ at: Date.now(), base: get().reviewBase, result }, ...get().recentReviews].slice(0, 8),
      });
    } catch (error) {
      set({
        reviewBusy: false,
        error: error instanceof Error ? error.message : "Git review failed.",
      });
    }
  },
  applyFix: async (finding) => {
    useUiStore.getState().setView("project");
    useUiStore.setState({ agentVisible: true });
    await gitReviewService.applyFix(finding);
  },
  createReviewTask: async (finding) => {
    const projectId = useProjectStore.getState().currentProject?.id;
    await taskManager.create({
      title: finding.title,
      description: finding.detail,
      projectId,
    });
  },
}));

export function visibleGitFiles(state: GitState): GitFileChange[] {
  const query = state.changeQuery.trim().toLowerCase();
  const files = filesOf(state.status).filter((file) => {
    if (state.changeFilter !== "all" && file.kind !== state.changeFilter) return false;
    if (!query) return true;
    return file.path.toLowerCase().includes(query);
  });
  const sorted = [...files];
  if (state.changeSort === "status") sorted.sort((a, b) => a.kind.localeCompare(b.kind) || a.path.localeCompare(b.path));
  else if (state.changeSort === "changes") sorted.sort((a, b) => (b.additions + b.deletions) - (a.additions + a.deletions));
  else sorted.sort((a, b) => a.path.localeCompare(b.path));
  return sorted;
}
