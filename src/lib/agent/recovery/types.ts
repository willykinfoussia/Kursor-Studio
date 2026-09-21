import type { TaskComplexity } from "../workflows/types";

export const ABSENT_HASH = "absent";

export const FILE_MUTATE_TOOLS = new Set([
  "write_file",
  "create_file",
  "delete_file",
  "apply_patch",
]);

export interface CommandLogEntry {
  command: string;
  exitCode: number | null;
}

export interface TestLogEntry {
  command: string;
  ok: boolean;
}

export interface ChangeLog {
  created: string[];
  modified: string[];
  deleted: string[];
  commandsExecuted: CommandLogEntry[];
  testsExecuted: TestLogEntry[];
}

export interface JournalEntry {
  existed: boolean;
  content: string | null;
}

export type RecoveryKind = "git" | "snapshot";

export interface RecoveryCheckpoint {
  id: string;
  createdAt: number;
  kind: RecoveryKind;
  gitSha?: string;
  journal: Record<string, JournalEntry>;
  log: ChangeLog;
  baselineHashes: Record<string, string>;
  lastAgentHashes: Record<string, string>;
}

export interface RollbackResult {
  restored: string[];
  skippedExternal: string[];
  deleted: string[];
}

export interface RecoveryFiles {
  readFile(path: string): Promise<string>;
  writeFile(path: string, content: string): Promise<void>;
  delete(path: string): Promise<void>;
}

export interface RecoveryGit {
  isRepo(): Promise<boolean>;
  stashCreate(): Promise<string | null>;
  showPath(sha: string, path: string): Promise<string | null>;
  restorePaths(sha: string, paths: string[]): Promise<void>;
}

export function emptyChangeLog(): ChangeLog {
  return {
    created: [],
    modified: [],
    deleted: [],
    commandsExecuted: [],
    testsExecuted: [],
  };
}

export function shouldCreateCheckpoint(complexity: TaskComplexity): boolean {
  return complexity === "medium" || complexity === "complex";
}

export function contentHash(content: string | null): string {
  if (content === null) return ABSENT_HASH;
  let hash = 5381;
  for (let index = 0; index < content.length; index += 1) {
    hash = ((hash << 5) + hash) ^ content.charCodeAt(index);
  }
  return (hash >>> 0).toString(16);
}

export function isTestCommand(command: string): boolean {
  return /\b(vitest|pytest)\b/i.test(command)
    || /\bcargo\s+test\b/i.test(command)
    || /\btest\b/i.test(command);
}

export function changeLogPaths(log: ChangeLog): string[] {
  return uniquePaths([...log.created, ...log.modified, ...log.deleted]);
}

export function uniquePaths(paths: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const path of paths) {
    if (!path || seen.has(path)) continue;
    seen.add(path);
    result.push(path);
  }
  return result;
}
