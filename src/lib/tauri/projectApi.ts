import type {
  GitBranchInfo,
  GitCommitDetail,
  GitCompare,
  GitDiff,
  GitFileContents,
  GitLogPage,
  GitShowPath,
  GitStatus,
  NativeFileEntry,
  ProjectInfo,
  WalkedFile,
} from "../../types/tauri";
import { invokeCommand, isTauri } from "./invoke";

async function openDirectoryDialog(): Promise<string | null> {
  if (!isTauri()) {
    throw new Error("Opening a project requires the Kursor desktop runtime.");
  }
  const { open } = await import("@tauri-apps/plugin-dialog");
  const selected = await open({
    directory: true,
    multiple: false,
    title: "Open Project",
  });
  if (Array.isArray(selected)) return selected[0] ?? null;
  return selected;
}

export const projectApi = {
  pickDirectory: openDirectoryDialog,
  open: (path: string) => invokeCommand<ProjectInfo>("project_open", { path }),
  listRecent: () => invokeCommand<ProjectInfo[]>("project_list_recent", undefined, []),
  listFiles: (path = "", showExcluded = false) =>
    invokeCommand<NativeFileEntry[]>("project_list_files", { path, showExcluded }),
  readFile: (path: string) => invokeCommand<string>("project_read_file", { path }),
  writeFile: (path: string, content: string) => invokeCommand<void>("project_write_file", { path, content }),
  createFile: (path: string) => invokeCommand<void>("project_create_file", { path }),
  createDirectory: (path: string) => invokeCommand<void>("project_create_directory", { path }),
  rename: (path: string, newPath: string) => invokeCommand<void>("project_rename", { path, newPath }),
  delete: (path: string) => invokeCommand<void>("project_delete", { path }),
  reveal: (path: string) => invokeCommand<void>("project_reveal", { path }),
  detectType: () => invokeCommand<string | null>("project_detect_type"),
  searchFiles: (query: string) => invokeCommand<NativeFileEntry[]>("project_search_files", { query }),
  walkFiles: (showExcluded = false) => invokeCommand<WalkedFile[]>("project_walk_files", { showExcluded }),
  readBytes: (path: string) => invokeCommand<string>("project_read_bytes", { path }),
  gitStatus: () => invokeCommand<GitStatus>("project_git_status"),
  gitDiff: (path?: string) => invokeCommand<GitDiff>("project_git_diff", { path }),
  gitDiffAt: (input?: { path?: string; staged?: boolean; from?: string; to?: string }) =>
    invokeCommand<GitDiff>("project_git_diff_at", {
      path: input?.path,
      staged: input?.staged ?? false,
      from: input?.from,
      to: input?.to,
    }),
  gitFileContents: (input: { path: string; staged?: boolean; from?: string; to?: string; force?: boolean }) =>
    invokeCommand<GitFileContents>("project_git_file_contents", {
      path: input.path,
      staged: input.staged ?? false,
      from: input.from,
      to: input.to,
      force: input.force ?? false,
    }),
  gitIsRepo: () => invokeCommand<boolean>("project_git_is_repo", undefined, false),
  gitStashCreate: () => invokeCommand<string>("project_git_stash_create"),
  gitShowPath: (sha: string, path: string) =>
    invokeCommand<GitShowPath>("project_git_show_path", { sha, path }),
  gitRestorePaths: (sha: string, paths: string[]) =>
    invokeCommand<void>("project_git_restore_paths", { sha, paths }),
  gitLog: (skip = 0, limit = 200, all = false) =>
    invokeCommand<GitLogPage>("project_git_log", { skip, limit, all }),
  gitCommitDetail: (sha: string) => invokeCommand<GitCommitDetail>("project_git_commit_detail", { sha }),
  gitBranchDetails: () => invokeCommand<GitBranchInfo[]>("project_git_branch_details", undefined, []),
  gitCompare: (from: string, to: string) => invokeCommand<GitCompare>("project_git_compare", { from, to }),
  gitLastFetch: () => invokeCommand<number | null>("project_git_last_fetch", undefined, null),
  list: () => invokeCommand<ProjectInfo[]>("project_list", undefined, []),
  remove: (id: string) => invokeCommand<void>("project_remove", { id }),
};
