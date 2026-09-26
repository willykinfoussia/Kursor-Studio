export interface AppInfo {
  name: string;
  version: string;
  platform: string;
}

export interface NativeFileEntry {
  name: string;
  path: string;
  relativePath: string;
  kind: "file" | "directory";
  extension?: string;
  isDirectory: boolean;
}

export interface ProjectInfo {
  id: string;
  accountId?: string | null;
  name: string;
  rootPath: string;
  projectType?: string | null;
  githubOwner?: string | null;
  githubRepo?: string | null;
  defaultBranch?: string | null;
  createdAt?: number;
  updatedAt?: number;
  lastOpenedAt?: number | null;
  exists?: boolean;
}

export interface ProcessResult {
  command: string;
  stdout: string;
  stderr: string;
  exitCode: number | null;
  truncated?: boolean;
}

export interface ProcessJob {
  jobId: string;
  command: string;
}

export interface ProcessOutput {
  jobId: string;
  command: string;
  stdout: string;
  stderr: string;
  running: boolean;
  exitCode: number | null;
  truncated: boolean;
}

export interface GitStatus {
  branch: string;
  changedFiles: string[];
  clean: boolean;
  ahead?: number;
  behind?: number;
  stagedFiles?: number;
  files?: GitFileChange[];
}

export type GitFileKind = "M" | "A" | "D" | "R" | "U";

export interface GitFileChange {
  path: string;
  originalPath?: string | null;
  index: string;
  worktree: string;
  kind: GitFileKind | string;
  additions: number;
  deletions: number;
  staged: boolean;
  unstaged: boolean;
  binary: boolean;
}

export interface GitDiff {
  path?: string | null;
  diff: string;
}

export interface GitShowPath {
  path: string;
  content: string | null;
}

export interface GitFileContents {
  path: string;
  original: string | null;
  modified: string | null;
  binary: boolean;
  tooLarge: boolean;
  size: number;
}

export interface GitBranchInfo {
  name: string;
  ref: string;
  sha: string;
  current: boolean;
  remote: boolean;
  upstream?: string | null;
  kind: "local" | "remote" | "tag" | string;
  timestamp: number;
  subject: string;
}

export interface GitCommitInfo {
  sha: string;
  shortSha: string;
  parents: string[];
  author: string;
  email: string;
  timestamp: number;
  subject: string;
  body: string;
  refs: string[];
  insertions: number;
  deletions: number;
  filesChanged: number;
}

export interface GitLogPage {
  commits: GitCommitInfo[];
  hasMore: boolean;
  skip: number;
}

export interface GitCompare {
  ahead: number;
  behind: number;
  from: string;
  to: string;
}

export interface GitCommitFile {
  path: string;
  originalPath?: string | null;
  kind: string;
  additions: number;
  deletions: number;
  binary: boolean;
}

export interface GitCommitDetail {
  commit: GitCommitInfo;
  files: GitCommitFile[];
}

export interface FileChangePayload {
  relativePath: string;
  kind: string;
}

export interface WalkedFile {
  relativePath: string;
  size: number;
  modifiedAt: number;
}

export interface TerminalSessionInfo {
  id: string;
  shell: string;
  cwd: string;
  status: "running" | "exited";
}

export interface TerminalOutputPayload {
  sessionId: string;
  data: string;
}

export interface TerminalExitPayload {
  sessionId: string;
  exitCode: number | null;
}
