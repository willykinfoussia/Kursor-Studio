import { DEFAULT_EXCLUDED_DIRECTORIES } from "../../filesystem/fileTypes";
import { extensionOf, normalizeRelativePath } from "../../filesystem/pathUtils";
import { GRAPH_CACHE_DIR } from "../config";
import type { GraphFileStore, WalkedFile } from "../types";

export const GRAPH_EXTENSIONS = new Set([
  "ts", "tsx", "js", "jsx", "mjs", "cjs",
  "json", "md", "markdown", "css", "scss",
  "html", "htm", "rs", "py", "go", "java", "kt",
  "c", "h", "cpp", "hpp", "cs", "rb", "php",
  "sql", "toml", "yaml", "yml", "xml", "txt",
  "sh", "bash", "csv", "tsv", "xlsx", "xls",
]);

export function isGraphCachePath(filePath: string): boolean {
  const normalized = normalizeRelativePath(filePath);
  return normalized === GRAPH_CACHE_DIR || normalized.startsWith(`${GRAPH_CACHE_DIR}/`);
}

export function shouldIndexPath(filePath: string): boolean {
  const normalized = normalizeRelativePath(filePath);
  if (!normalized || isGraphCachePath(normalized)) return false;
  const parts = normalized.split("/");
  if (parts.some((part) => (DEFAULT_EXCLUDED_DIRECTORIES as readonly string[]).includes(part))) return false;
  const extension = extensionOf(normalized);
  if (!extension) return false;
  return GRAPH_EXTENSIONS.has(extension);
}

export class FileScanner {
  constructor(private readonly files: GraphFileStore) {}

  async scan(): Promise<WalkedFile[]> {
    const walked = await this.files.walkFiles();
    return walked
      .filter((entry) => shouldIndexPath(entry.relativePath))
      .map((entry) => ({
        ...entry,
        relativePath: normalizeRelativePath(entry.relativePath),
      }))
      .sort((left, right) => left.relativePath.localeCompare(right.relativePath));
  }
}
