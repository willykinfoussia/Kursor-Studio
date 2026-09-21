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

export function resolveProjectPath(projectRoot: string, relativePath: string): string {
  if (!projectRoot.trim()) {
    throw new PathOutsideProjectError();
  }
  const normalized = normalizeRelativePath(relativePath.trim());
  if (!normalized || normalized === ".") {
    return projectRoot.replace(/\\/g, "/");
  }
  if (
    normalized.startsWith("/") ||
    normalized.startsWith("~") ||
    isWindowsAbsolute(normalized)
  ) {
    throw new PathOutsideProjectError();
  }
  const parts = normalized.split("/").filter((part: string) => part && part !== ".");
  for (const part of parts) {
    if (part === "..") {
      throw new PathOutsideProjectError();
    }
  }
  if (parts.length === 0) {
    return projectRoot.replace(/\\/g, "/");
  }
  return `${projectRoot.replace(/\\/g, "/")}/${parts.join("/")}`;
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
