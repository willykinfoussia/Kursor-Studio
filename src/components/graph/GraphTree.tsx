import { useMemo, useState } from "react";
import {
  ChevronDown, ChevronRight, File, FileCode2, FileJson, FileText, Folder, FolderOpen,
} from "lucide-react";
import { fileName, parentRelativePath } from "../../lib/filesystem/pathUtils";
import { classifyFile } from "../../lib/graph/classify";
import { nodeMatchesFilters } from "../../lib/graph/filters";
import type { FileNode } from "../../lib/graph/types";
import { useGraphStore } from "../../stores/graphStore";
import { useProjectStore } from "../../stores/projectStore";

interface TreeNode {
  id: string;
  name: string;
  path: string;
  kind: "file" | "directory";
  children: TreeNode[];
  file?: FileNode;
}

function buildTree(nodes: FileNode[], rootName: string): TreeNode {
  const root: TreeNode = { id: "root", name: rootName, path: "", kind: "directory", children: [] };
  const dirs = new Map<string, TreeNode>([["", root]]);
  const ensureDir = (path: string): TreeNode => {
    const existing = dirs.get(path);
    if (existing) return existing;
    const parentPath = parentRelativePath(path);
    const parent = ensureDir(parentPath);
    const node: TreeNode = {
      id: `dir:${path}`,
      name: fileName(path) || path,
      path,
      kind: "directory",
      children: [],
    };
    parent.children.push(node);
    dirs.set(path, node);
    return node;
  };
  for (const file of nodes) {
    const parent = ensureDir(parentRelativePath(file.path));
    parent.children.push({
      id: file.id,
      name: fileName(file.path),
      path: file.path,
      kind: "file",
      children: [],
      file,
    });
  }
  const sortNode = (node: TreeNode) => {
    node.children.sort((left, right) => {
      if (left.kind !== right.kind) return left.kind === "directory" ? -1 : 1;
      return left.name.localeCompare(right.name);
    });
    node.children.forEach(sortNode);
  };
  sortNode(root);
  return root;
}

function FileGlyph({ name, category }: { name: string; category?: string }) {
  if (name.endsWith(".xlsx") || category === "data") return <FileJson size={14} className="file-icon json-icon" />;
  if (name.endsWith(".tsx") || name.endsWith(".ts") || name.endsWith(".py")) return <FileCode2 size={14} className="file-icon tsx-icon" />;
  if (name.endsWith(".json")) return <FileJson size={14} className="file-icon json-icon" />;
  if (name.endsWith(".md")) return <FileText size={14} className="file-icon md-icon" />;
  return <File size={14} className="file-icon" />;
}

function GraphTreeNode({
  node,
  depth,
  expanded,
  toggle,
}: {
  node: TreeNode;
  depth: number;
  expanded: Set<string>;
  toggle: (id: string) => void;
}) {
  const selectedNodeId = useGraphStore((state) => state.selectedNodeId);
  const selectSpec = useGraphStore((state) => state.selectSpec);
  const isDirectory = node.kind === "directory";
  const isExpanded = expanded.has(node.id);
  const selected = node.file && node.file.id === selectedNodeId;

  return (
    <>
      <div
        className={`tree-row ${selected ? "selected" : ""} ${node.id === "root" ? "root" : ""}`}
        style={{ paddingLeft: 5 + depth * 13 }}
        onClick={() => {
          if (isDirectory) toggle(node.id);
          else if (node.file) selectSpec(node.file.path);
        }}
        role="treeitem"
        aria-selected={Boolean(selected)}
      >
        <span className="tree-chevron">
          {isDirectory && (isExpanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />)}
        </span>
        {isDirectory
          ? (isExpanded ? <FolderOpen size={14} className="file-icon folder-icon" /> : <Folder size={14} className="file-icon folder-icon" />)
          : <FileGlyph name={node.name} category={node.file ? classifyFile(node.file.path) : undefined} />}
        <span>{node.name}</span>
      </div>
      {isDirectory && isExpanded && node.children.map((child) => (
        <GraphTreeNode key={child.id} node={child} depth={depth + 1} expanded={expanded} toggle={toggle} />
      ))}
    </>
  );
}

export function GraphTree() {
  const nodes = useGraphStore((state) => state.nodes);
  const filters = useGraphStore((state) => state.filters);
  const projectName = useProjectStore((state) => state.currentProject?.name ?? "Project");
  const visible = useMemo(
    () => nodes.filter((node) => nodeMatchesFilters(node, filters)),
    [nodes, filters],
  );
  const tree = useMemo(() => buildTree(visible, projectName), [visible, projectName]);
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set(["root"]));
  const toggle = (id: string) => {
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <aside className="sidebar graph-tree">
      <div className="section-header"><span>FILES</span></div>
      <div className="tree" role="tree">
        <GraphTreeNode node={tree} depth={0} expanded={expanded} toggle={toggle} />
      </div>
    </aside>
  );
}
