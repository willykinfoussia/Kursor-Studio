import { fileName, parentRelativePath } from "../filesystem/pathUtils";
import { canonicalSpecKind, resolveSpecKind, specDisplayRelative, specKindLabel, type SpecKind, type SpecScope } from "./classify";
import type { FileNode } from "./types";

export interface SpecTreeNode {
  id: string;
  name: string;
  path: string;
  kind: "file" | "group";
  children: SpecTreeNode[];
  file?: FileNode;
  specKind?: SpecKind | string;
  count: number;
}

function groupKind(name: string): SpecKind | undefined {
  return canonicalSpecKind(name);
}

export function groupLabel(name: string, scope?: SpecScope): string {
  return specKindLabel(name, scope);
}

export function buildSpecTree(
  files: FileNode[],
  extraGroups: string[],
  scopeId: "account" | "project",
): SpecTreeNode {
  const root: SpecTreeNode = {
    id: scopeId,
    name: scopeId,
    path: "",
    kind: "group",
    children: [],
    count: 0,
  };
  const dirs = new Map<string, SpecTreeNode>([["", root]]);

  const ensureGroup = (relative: string): SpecTreeNode => {
    if (!relative) return root;
    const existing = dirs.get(relative);
    if (existing) return existing;
    const parent = ensureGroup(parentRelativePath(relative));
    const name = fileName(relative) || relative;
    const node: SpecTreeNode = {
      id: `${scopeId}:${relative}`,
      name,
      path: relative,
      kind: "group",
      children: [],
      specKind: groupKind(name),
      count: 0,
    };
    parent.children.push(node);
    dirs.set(relative, node);
    return node;
  };

  for (const group of extraGroups) {
    if (group) ensureGroup(group);
  }

  for (const file of files) {
    const relative = specDisplayRelative(file.path);
    const parent = ensureGroup(parentRelativePath(relative));
    parent.children.push({
      id: file.id,
      name: fileName(file.path),
      path: file.path,
      kind: "file",
      children: [],
      file,
      specKind: resolveSpecKind(file.path, file.metadata),
      count: 0,
    });
  }

  const sortAndCount = (node: SpecTreeNode): number => {
    node.children.sort((left, right) => {
      if (left.kind !== right.kind) return left.kind === "group" ? -1 : 1;
      return left.name.localeCompare(right.name);
    });
    let count = 0;
    for (const child of node.children) {
      count += child.kind === "file" ? 1 : sortAndCount(child);
    }
    node.count = count;
    return count;
  };
  sortAndCount(root);
  return root;
}

export function collectGroupIds(node: SpecTreeNode, displayRelative: string, ids: string[]) {
  if (node.kind === "group" && node.path) ids.push(node.id);
  for (const child of node.children) {
    if (child.kind !== "group") continue;
    if (displayRelative === child.path || displayRelative.startsWith(`${child.path}/`)) {
      collectGroupIds(child, displayRelative, ids);
    }
  }
}
