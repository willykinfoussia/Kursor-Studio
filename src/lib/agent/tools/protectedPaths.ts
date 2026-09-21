import { normalizeRelativePath, PathOutsideProjectError, resolveProjectPath } from "../../filesystem/pathUtils";

export type PathAccess = "read" | "write";

const ALWAYS_PROTECTED_NAMES = new Set(["credentials.json"]);
const ENV_READ_ALLOW = new Set([".env.example", ".env.sample", ".env.template"]);

export function pathAccessForTool(tool?: string, capability?: string): PathAccess {
  if (capability === "filesystem.read" || capability === "git.read") return "read";
  if (tool && /^(read_|list_|search_|git_status|git_diff)/.test(tool)) return "read";
  return "write";
}

export function isProtectedPath(relativePath: string, access: PathAccess = "read"): boolean {
  const normalized = normalizeRelativePath(relativePath).toLowerCase();
  if (!normalized || normalized === ".") return false;
  const parts = normalized.split("/");
  if (parts[0] === ".git" || parts.includes(".git")) return true;
  const name = parts[parts.length - 1] ?? "";
  if (ALWAYS_PROTECTED_NAMES.has(name)) return true;
  if (name.endsWith(".pem") || name.endsWith(".key")) return true;
  if (name === ".env" || name.startsWith(".env.")) {
    if (access === "write") return false;
    return !ENV_READ_ALLOW.has(name);
  }
  return false;
}

export function inputFilePath(input: unknown): string | undefined {
  if (!input || typeof input !== "object") return undefined;
  const record = input as Record<string, unknown>;
  for (const key of ["path", "file"]) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return undefined;
}

export function inputCwd(input: unknown): string | undefined {
  if (!input || typeof input !== "object") return undefined;
  const cwd = (input as Record<string, unknown>).cwd;
  return typeof cwd === "string" && cwd.trim() ? cwd.trim() : undefined;
}

export function inputPath(input: unknown): string | undefined {
  return inputFilePath(input) ?? inputCwd(input);
}

export function assertProjectPath(projectRoot: string | null, relativePath: string): string {
  if (!projectRoot) {
    throw new PathOutsideProjectError("No project is currently open.");
  }
  return resolveProjectPath(projectRoot, relativePath);
}
