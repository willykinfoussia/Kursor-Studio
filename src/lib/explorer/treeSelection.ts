import type { ProjectFile } from "../../types/project";

export function findProjectFile(nodes: ProjectFile[], pathOrId: string): ProjectFile | undefined {
  for (const node of nodes) {
    if (node.path === pathOrId || node.id === pathOrId) return node;
    if (node.children) {
      const found = findProjectFile(node.children, pathOrId);
      if (found) return found;
    }
  }
  return undefined;
}

export function visibleRows(nodes: ProjectFile[], expanded: Set<string>): ProjectFile[] {
  return nodes.flatMap((node) => {
    const children = node.kind === "directory" && expanded.has(node.id) && node.children
      ? visibleRows(node.children, expanded)
      : [];
    return [node, ...children];
  });
}

export function rangePaths(rows: ProjectFile[], from: string, to: string): string[] {
  const fromIndex = rows.findIndex((row) => row.path === from);
  const toIndex = rows.findIndex((row) => row.path === to);
  if (fromIndex < 0 && toIndex < 0) return [to];
  if (fromIndex < 0) return [to];
  if (toIndex < 0) return [from];
  const start = Math.min(fromIndex, toIndex);
  const end = Math.max(fromIndex, toIndex);
  return rows.slice(start, end + 1).map((row) => row.path);
}

export function pruneNestedPaths(paths: string[]): string[] {
  const unique = [...new Set(paths)];
  return unique.filter((path) => {
    if (!path) return true;
    return !unique.some((other) => other !== "" && other !== path && path.startsWith(`${other}/`));
  });
}

export function remapSelection(
  state: { selectedFile: string | null; selectedFiles: string[]; selectionAnchor: string | null },
  map: (path: string) => string | null,
) {
  const selectedFiles = [...new Set(state.selectedFiles.map(map).filter((path): path is string => path != null))];
  const selectedFile = state.selectedFile != null ? map(state.selectedFile) : null;
  const selectionAnchor = state.selectionAnchor != null ? map(state.selectionAnchor) : null;
  return {
    selectedFiles,
    selectedFile: selectedFile ?? selectedFiles[selectedFiles.length - 1] ?? null,
    selectionAnchor: selectionAnchor ?? selectedFile ?? selectedFiles[selectedFiles.length - 1] ?? null,
  };
}

export function singleSelection(path: string | null) {
  return {
    selectedFile: path,
    selectedFiles: path != null ? [path] : [],
    selectionAnchor: path,
  };
}
