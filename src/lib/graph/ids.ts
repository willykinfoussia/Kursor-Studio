import { fileName, normalizeRelativePath } from "../filesystem/pathUtils";

export function normalizeGraphPath(filePath: string): string {
  return normalizeRelativePath(filePath).replace(/^\/+/, "");
}

export function fileNodeId(filePath: string): string {
  return `file:${normalizeGraphPath(filePath)}`;
}

export function edgeId(sourceId: string, targetId: string, relation: string): string {
  return `edge:${sourceId}:${targetId}:${relation}`;
}

export function pathFromNodeId(id: string): string {
  return id.startsWith("file:") ? id.slice(5) : id;
}

export function fileBasename(filePath: string): string {
  const name = fileName(normalizeGraphPath(filePath));
  const index = name.lastIndexOf(".");
  return (index > 0 ? name.slice(0, index) : name).toLowerCase();
}

export function lookupPath(
  filePath: string,
  files: Map<string, { path: string }>,
): string | undefined {
  const normalized = normalizeGraphPath(filePath);
  const direct = files.get(normalized) ?? files.get(normalized.toLowerCase());
  if (direct) return direct.path;
  for (const [key, value] of files) {
    if (key.toLowerCase() === normalized.toLowerCase()) return value.path;
  }
  return undefined;
}
