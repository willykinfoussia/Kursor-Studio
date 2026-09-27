import { isProductImplementationPath } from "./gates";

export interface FileExcerpt {
  path: string;
  content: string;
}

export const MAX_EXCERPT_FILES = 8;
export const MAX_EXCERPT_CHARS = 2000;

const SKIP_EXTENSIONS = new Set([
  "png", "jpg", "jpeg", "gif", "webp", "ico", "bmp",
  "pdf", "zip", "gz", "woff", "woff2", "ttf", "eot", "otf",
  "mp4", "mp3", "wasm", "exe", "dll", "bin", "lock", "map",
]);

const SKIP_NAMES = new Set([
  "package-lock.json",
  "yarn.lock",
  "pnpm-lock.yaml",
  "bun.lock",
  "cargo.lock",
  "composer.lock",
]);

function clip(value: string, max: number) {
  if (value.length <= max) return value;
  return `${value.slice(0, max - 1)}…`;
}

export function shouldSkipExcerpt(path: string): boolean {
  const normalized = path.trim().replace(/\\/g, "/").toLowerCase();
  if (!normalized) return true;
  if (normalized.includes("/node_modules/") || normalized.startsWith("node_modules/")) return true;
  if (normalized.includes(".kursor/specs") || normalized.startsWith("account/specs")) return true;
  const name = normalized.split("/").pop() ?? normalized;
  if (SKIP_NAMES.has(name)) return true;
  if (name.endsWith(".min.js") || name.endsWith(".min.css")) return true;
  const extension = name.includes(".") ? name.split(".").pop() ?? "" : "";
  return SKIP_EXTENSIONS.has(extension);
}

export async function collectProductExcerpts(
  paths: readonly string[],
  readFile: (path: string) => Promise<string>,
): Promise<FileExcerpt[]> {
  const selected = paths
    .map((path) => path.trim().replace(/\\/g, "/"))
    .filter((path) => isProductImplementationPath(path) && !shouldSkipExcerpt(path))
    .slice(0, MAX_EXCERPT_FILES);
  const excerpts: FileExcerpt[] = [];
  for (const path of selected) {
    try {
      const raw = await readFile(path);
      if (!raw || raw.includes("\0")) continue;
      excerpts.push({ path, content: clip(raw, MAX_EXCERPT_CHARS) });
    } catch {
      continue;
    }
  }
  return excerpts;
}
