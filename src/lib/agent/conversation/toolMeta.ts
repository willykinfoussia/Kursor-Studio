export const GROUPABLE_TOOLS = new Set([
  "list_files",
  "read_file",
  "search_files",
  "web_search",
  "fetch_url",
  "git_status",
  "git_diff",
]);

export const STANDALONE_TOOLS = new Set([
  "run_command",
  "start_process",
  "read_process",
  "kill_process",
  "write_file",
  "create_file",
  "delete_file",
  "apply_patch",
  "create_directory",
  "load_skill",
  "git_commit",
  "git_push",
  "git_pull",
  "git_fetch",
]);

export const PROCESS_TOOLS = new Set(["run_command", "start_process", "read_process", "kill_process", "write_stdin"]);
export const MUTATING_FILE_TOOLS = new Set([
  "write_file",
  "create_file",
  "delete_file",
  "apply_patch",
  "create_directory",
  "rename_file",
]);

export type ToolFamily = "explore" | "edit" | "terminal" | "git" | "web" | "verify" | "skill" | "other";

const EXPLORE_TOOLS = new Set([
  "list_files",
  "search_files",
  "read_file",
  "inspect_symbol",
  "get_diagnostics",
]);
const EDIT_TOOLS = new Set([
  "write_file",
  "create_file",
  "apply_patch",
  "delete_file",
  "rename_file",
  "create_directory",
]);
const TERMINAL_TOOLS = new Set(["run_command", "start_process", "read_process", "write_stdin", "kill_process"]);
const WEB_TOOLS = new Set(["web_search", "fetch_url"]);
const VERIFY_TOOLS = new Set(["typecheck", "lint", "test", "build", "runtime_check"]);
const SKILL_TOOLS = new Set(["load_skill"]);

export function isGroupableTool(name: string) {
  return GROUPABLE_TOOLS.has(name);
}

export function isStandaloneTool(name: string) {
  return STANDALONE_TOOLS.has(name);
}

export function isProcessTool(name: string) {
  return PROCESS_TOOLS.has(name);
}

export function toolFamily(name: string): ToolFamily {
  if (EXPLORE_TOOLS.has(name)) return "explore";
  if (EDIT_TOOLS.has(name)) return "edit";
  if (TERMINAL_TOOLS.has(name)) return "terminal";
  if (name.startsWith("git_")) return "git";
  if (WEB_TOOLS.has(name)) return "web";
  if (VERIFY_TOOLS.has(name)) return "verify";
  if (SKILL_TOOLS.has(name)) return "skill";
  return "other";
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object") return null;
  return value as Record<string, unknown>;
}

export function toolTarget(input: unknown): string {
  const record = asRecord(input);
  if (!record) return "";
  for (const key of ["path", "command", "query", "url", "jobId", "directory", "pattern", "skill"]) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) return value;
  }
  return "";
}

export function extractKnownFilePath(input: unknown): string | null {
  const record = asRecord(input);
  if (!record) return null;
  if (typeof record.path === "string" && looksLikePath(record.path)) return record.path;
  return null;
}

export function looksLikePath(value: string) {
  const normalized = value.replace(/\\/g, "/").trim();
  if (!normalized || normalized.includes("://") || normalized.includes(" ")) return false;
  return /^(?:[\w.-]+\/)+[\w.-]+(?:\.[\w]+)?$/.test(normalized) || /^[\w.-]+\.[\w]+$/.test(normalized);
}

export function filePathFromFence(language: string, meta?: string): string | null {
  const fromMeta = meta?.trim().split(/\s+/)[0];
  if (fromMeta && looksLikePath(fromMeta)) return fromMeta;
  if (looksLikePath(language)) return language;
  return null;
}

export function readToolData(output: unknown): Record<string, unknown> | null {
  const record = asRecord(output);
  if (!record) return null;
  if (record.data && typeof record.data === "object") return record.data as Record<string, unknown>;
  return record;
}

export function commandFromTool(input: unknown, output?: unknown): string {
  const data = readToolData(output);
  if (typeof data?.command === "string" && data.command.trim()) return data.command;
  return toolTarget(input);
}

export function processOutput(output: unknown): { stdout: string; stderr: string; exitCode: number | null } {
  const data = readToolData(output);
  return {
    stdout: typeof data?.stdout === "string" ? data.stdout : "",
    stderr: typeof data?.stderr === "string" ? data.stderr : "",
    exitCode: typeof data?.exitCode === "number" ? data.exitCode : null,
  };
}

export function formatDuration(startedAt?: number, finishedAt?: number) {
  if (!startedAt || !finishedAt || finishedAt < startedAt) return null;
  const ms = finishedAt - startedAt;
  if (ms < 1000) return `${ms} ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

export function formatThoughtDuration(ms: number) {
  if (ms < 1000) return `${Math.max(1, Math.round(ms / 1000))}s`;
  return `${Math.round(ms / 1000)}s`;
}
