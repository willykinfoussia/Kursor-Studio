import { isProductImplementationPath } from "./gates";

export interface FileExcerpt {
  path: string;
  content: string;
}

export const MAX_EXCERPT_FILES = 8;
export const MAX_EXCERPT_CHARS = 2000;
export const MAX_FILES_PER_DIRECTORY = 3;
const EXCERPT_TAIL = 500;

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

function directoryOf(path: string): string {
  const slash = path.lastIndexOf("/");
  return slash === -1 ? "." : path.slice(0, slash);
}

export function selectProductExcerptPaths(paths: readonly string[]): string[] {
  const grouped = new Map<string, string[]>();
  const order: string[] = [];
  for (const raw of paths) {
    const path = raw.trim().replace(/\\/g, "/");
    if (!path || !isProductImplementationPath(path) || shouldSkipExcerpt(path)) continue;
    const dir = directoryOf(path);
    if (!grouped.has(dir)) {
      grouped.set(dir, []);
      order.push(dir);
    }
    const bucket = grouped.get(dir) ?? [];
    if (bucket.length < MAX_FILES_PER_DIRECTORY) bucket.push(path);
  }
  const selected: string[] = [];
  let progressed = true;
  while (selected.length < MAX_EXCERPT_FILES && progressed) {
    progressed = false;
    for (const dir of order) {
      if (selected.length >= MAX_EXCERPT_FILES) break;
      const bucket = grouped.get(dir) ?? [];
      const taken = selected.filter((path) => directoryOf(path) === dir).length;
      if (taken < bucket.length) {
        selected.push(bucket[taken]);
        progressed = true;
      }
    }
  }
  return selected;
}

export function clipExcerpt(value: string, max = MAX_EXCERPT_CHARS): string {
  if (value.length <= max) return value;
  const tail = Math.min(EXCERPT_TAIL, max - 1);
  const head = max - tail - 3;
  return `${value.slice(0, head)}\n…\n${value.slice(-tail)}`;
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
  const selected = selectProductExcerptPaths(paths);
  const excerpts: FileExcerpt[] = [];
  for (const path of selected) {
    try {
      const raw = await readFile(path);
      if (!raw || raw.includes("\0")) continue;
      excerpts.push({ path, content: clipExcerpt(raw) });
    } catch {
      continue;
    }
  }
  return excerpts;
}
