export class PathOutsideProjectError extends Error {
  constructor(message = "The requested path is outside the active project.") {
    super(message);
    this.name = "PathOutsideProjectError";
  }
}

function isWindowsAbsolute(path: string) {
  return /^[a-zA-Z]:[\\/]/.test(path) || path.startsWith("\\\\");
}

export function normalizeRelativePath(relativePath: string) {
  return relativePath.replace(/\\/g, "/").replace(/^\.\//, "").replace(/\/+$/, "");
}

function strippedSlashPath(value: string) {
  return value.trim().replace(/\\/g, "/").replace(/\/+$/, "");
}

function assertRelativeSegments(normalized: string): string {
  if (!normalized || normalized === ".") return "";
  if (normalized.startsWith("/") || normalized.startsWith("~") || isWindowsAbsolute(normalized)) {
    throw new PathOutsideProjectError();
  }
  const parts = normalized.split("/").filter((part) => part && part !== ".");
  for (const part of parts) {
    if (part === "..") throw new PathOutsideProjectError();
  }
  return parts.join("/");
}

/** Relative path inside projectRoot. Absolute inputs are accepted only when they are the root or strictly inside it. */
export function toProjectRelative(projectRoot: string, inputPath: string): string {
  const root = strippedSlashPath(projectRoot);
  if (!root) throw new PathOutsideProjectError();
  const raw = strippedSlashPath(inputPath);
  if (!raw || raw === ".") return "";
  if (raw.startsWith("~")) throw new PathOutsideProjectError();
  if (isWindowsAbsolute(raw) || raw.startsWith("/")) {
    const rootKey = root.toLowerCase();
    const rawKey = raw.toLowerCase();
    if (rawKey === rootKey) return "";
    if (!rawKey.startsWith(`${rootKey}/`)) throw new PathOutsideProjectError();
    return assertRelativeSegments(raw.slice(root.length).replace(/^\//, ""));
  }
  return assertRelativeSegments(normalizeRelativePath(inputPath.trim()));
}

export function resolveProjectPath(projectRoot: string, relativePath: string): string {
  const relative = toProjectRelative(projectRoot, relativePath);
  const root = strippedSlashPath(projectRoot);
  if (!relative) return root;
  return `${root}/${relative}`;
}

export function parentRelativePath(relativePath: string) {
  const normalized = normalizeRelativePath(relativePath);
  const index = normalized.lastIndexOf("/");
  return index <= 0 ? "" : normalized.slice(0, index);
}

export function joinRelativePath(parent: string, name: string) {
  const cleanParent = normalizeRelativePath(parent);
  const cleanName = name.replace(/\\/g, "/").split("/").pop()?.trim() ?? "";
  if (!cleanName || cleanName === ".." || cleanName.includes("..")) {
    throw new PathOutsideProjectError();
  }
  return cleanParent ? `${cleanParent}/${cleanName}` : cleanName;
}

export function fileName(relativePath: string) {
  const normalized = normalizeRelativePath(relativePath);
  return normalized.split("/").pop() ?? normalized;
}

export function extensionOf(relativePath: string) {
  const name = fileName(relativePath);
  const index = name.lastIndexOf(".");
  return index > 0 ? name.slice(index + 1).toLowerCase() : undefined;
}

export function sameFsPath(left: string, right: string) {
  const normalize = (value: string) => value.replace(/\\/g, "/").replace(/\/+$/, "");
  return normalize(left).toLowerCase() === normalize(right).toLowerCase();
}
