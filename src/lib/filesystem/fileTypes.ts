export type FileKind = "file" | "directory";

export interface FileEntry {
  name: string;
  path: string;
  relativePath: string;
  kind: FileKind;
  extension?: string;
}

export interface FileWatchEvent {
  relativePath: string;
  kind: "create" | "modify" | "remove" | string;
}

export const DEFAULT_EXCLUDED_DIRECTORIES = [
  ".git",
  "node_modules",
  "dist",
  "build",
  "target",
  ".vscode",
  ".idea",
] as const;

export const BINARY_EXTENSIONS = new Set([
  "png", "jpg", "jpeg", "gif", "webp", "ico", "bmp", "avif", "tif", "tiff",
  "mp4", "webm", "mov", "avi", "mkv", "wmv",
  "zip", "tar", "gz", "tgz", "7z", "rar", "bz2",
  "exe", "dll", "so", "dylib", "bin", "o", "a", "lib", "obj", "class",
  "ttf", "otf", "woff", "woff2", "eot",
  "pdf", "wasm",
]);
