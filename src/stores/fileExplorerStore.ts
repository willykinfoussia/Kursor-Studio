import { create } from "zustand";
import { fileSystemService } from "../lib/filesystem/FileSystemService";
import type { FileEntry } from "../lib/filesystem/fileTypes";
import { joinRelativePath, parentRelativePath } from "../lib/filesystem/pathUtils";
import {
  findProjectFile,
  rangePaths,
  remapSelection,
  singleSelection,
  visibleRows,
} from "../lib/explorer/treeSelection";
import type { Project, ProjectFile } from "../types/project";

function mapTree(nodes: ProjectFile[], map: (node: ProjectFile) => ProjectFile | null): ProjectFile[] {
  return nodes.flatMap((node) => {
    const next = map({
      ...node,
      children: node.children ? mapTree(node.children, map) : node.children,
    });
    return next ? [next] : [];
  });
}

export function flattenProjectFiles(nodes: ProjectFile[]): ProjectFile[] {
  return nodes.flatMap((node) => [node, ...(node.children ? flattenProjectFiles(node.children) : [])]);
}

function toNode(entry: FileEntry): ProjectFile {
  return {
    id: entry.relativePath || entry.name,
    name: entry.name,
    path: entry.relativePath,
    kind: entry.kind,
    loaded: entry.kind === "file",
  };
}

interface FileExplorerState {
  files: ProjectFile[];
  selectedFile: string | null;
  selectedFiles: string[];
  selectionAnchor: string | null;
  expanded: Set<string>;
  loadingPaths: Set<string>;
  status: string | null;
  loadRoot: (project: Project) => Promise<void>;
  loadDirectory: (path: string) => Promise<void>;
  selectFile: (path: string) => void;
  toggleSelect: (path: string) => void;
  selectRange: (path: string) => void;
  selectAllVisible: () => void;
  clearToPrimary: () => void;
  moveSelection: (delta: number, extend: boolean) => void;
  selectVisibleEdge: (edge: "start" | "end", extend: boolean) => void;
  revealInTree: (path: string) => Promise<void>;
  toggleExpanded: (id: string) => Promise<void>;
  refreshPath: (path: string) => Promise<void>;
  createEntry: (parentPath: string, kind: "file" | "directory", name: string) => Promise<string>;
  renameEntry: (path: string, name: string) => Promise<string>;
  deleteEntry: (path: string) => Promise<void>;
  knownFiles: () => FileEntry[];
  reset: () => void;
}

export const useFileExplorerStore = create<FileExplorerState>((set, get) => ({
  files: [],
  selectedFile: null,
  selectedFiles: [],
  selectionAnchor: null,
  expanded: new Set<string>(),
  loadingPaths: new Set<string>(),
  status: null,
  loadRoot: async (project) => {
    set({ status: "Loading project...", loadingPaths: new Set([""]) });
    try {
      const entries = await fileSystemService.listDirectory("");
      set({
        files: [{
          id: "root",
          name: project.name,
          path: "",
          kind: "directory",
          loaded: true,
          children: entries.map(toNode),
        }],
        expanded: new Set(["root"]),
        ...singleSelection(null),
        loadingPaths: new Set(),
        status: null,
      });
    } catch (error) {
      set({
        files: [],
        loadingPaths: new Set(),
        status: error instanceof Error ? error.message : "Unable to read file.",
        ...singleSelection(null),
      });
    }
  },
  loadDirectory: async (path) => {
    const loadingPaths = new Set(get().loadingPaths);
    loadingPaths.add(path);
    set({ loadingPaths, status: "Loading files..." });
    try {
      const entries = await fileSystemService.listDirectory(path);
      set((state) => ({
        files: mapTree(state.files, (node) => node.path === path ? { ...node, children: entries.map(toNode), loaded: true } : node),
        loadingPaths: new Set([...state.loadingPaths].filter((item) => item !== path)),
        status: null,
      }));
    } catch (error) {
      set((state) => ({
        loadingPaths: new Set([...state.loadingPaths].filter((item) => item !== path)),
        status: error instanceof Error ? error.message : "Unable to read file.",
      }));
    }
  },
  selectFile: (path) => set(singleSelection(path)),
  toggleSelect: (path) => set((state) => {
    const selectedFiles = state.selectedFiles.includes(path)
      ? state.selectedFiles.filter((item) => item !== path)
      : [...state.selectedFiles, path];
    return { selectedFiles, selectedFile: path, selectionAnchor: path };
  }),
  selectRange: (path) => set((state) => {
    const from = state.selectionAnchor ?? state.selectedFile ?? path;
    return {
      selectedFiles: rangePaths(visibleRows(state.files, state.expanded), from, path),
      selectedFile: path,
    };
  }),
  selectAllVisible: () => set((state) => {
    const selectedFiles = visibleRows(state.files, state.expanded).map((row) => row.path);
    const selectedFile = state.selectedFile != null && selectedFiles.includes(state.selectedFile)
      ? state.selectedFile
      : (selectedFiles[selectedFiles.length - 1] ?? null);
    return { selectedFiles, selectedFile, selectionAnchor: state.selectionAnchor ?? selectedFile };
  }),
  clearToPrimary: () => set((state) => singleSelection(state.selectedFile)),
  moveSelection: (delta, extend) => {
    const rows = visibleRows(get().files, get().expanded);
    if (rows.length === 0) return;
    const current = get().selectedFile;
    let index = rows.findIndex((row) => row.path === current);
    if (index < 0) {
      index = delta > 0 ? -1 : rows.length;
    }
    const next = rows[Math.max(0, Math.min(rows.length - 1, index + delta))];
    if (!next) return;
    if (extend) get().selectRange(next.path);
    else get().selectFile(next.path);
  },
  selectVisibleEdge: (edge, extend) => {
    const rows = visibleRows(get().files, get().expanded);
    const next = edge === "start" ? rows[0] : rows[rows.length - 1];
    if (!next) return;
    if (extend) get().selectRange(next.path);
    else get().selectFile(next.path);
  },
  revealInTree: async (path) => {
    const normalized = path.replace(/\\/g, "/");
    const parts = normalized.split("/").filter(Boolean);
    const dirPaths: string[] = [];
    let acc = "";
    for (let i = 0; i < parts.length - 1; i++) {
      acc = acc ? `${acc}/${parts[i]}` : parts[i];
      dirPaths.push(acc);
    }

    const expanded = new Set(get().expanded);
    expanded.add("root");
    for (const dirPath of dirPaths) {
      let directory = findProjectFile(get().files, dirPath);
      if (directory?.kind === "directory" && !directory.loaded) {
        await get().loadDirectory(dirPath);
        directory = findProjectFile(get().files, dirPath);
      }
      expanded.add(directory?.id ?? dirPath);
    }
    set({ expanded, ...singleSelection(normalized) });
  },
  toggleExpanded: async (id) => {
    const directory = findProjectFile(get().files, id);
    const willExpand = directory ? !get().expanded.has(directory.id) : false;
    if (directory?.kind === "directory" && willExpand && !directory.loaded) {
      await get().loadDirectory(directory.path);
    }
    set((state) => {
      const expanded = new Set(state.expanded);
      expanded.has(id) ? expanded.delete(id) : expanded.add(id);
      return { expanded };
    });
  },
  refreshPath: async (path) => {
    const node = findProjectFile(get().files, path);
    const directory = !path || node?.kind === "directory" ? path : parentRelativePath(path);
    const target = findProjectFile(get().files, directory);
    if (directory === "" || target?.loaded) {
      await get().loadDirectory(directory);
    }
  },
  createEntry: async (parentPath, kind, name) => {
    const relative = joinRelativePath(parentPath, name);
    if (kind === "file") await fileSystemService.createFile(relative);
    else await fileSystemService.createDirectory(relative);
    await get().loadDirectory(parentPath);
    const parent = findProjectFile(get().files, parentPath || "root");
    if (parent) {
      const expanded = new Set(get().expanded);
      expanded.add(parent.id);
      set({ expanded });
    }
    return relative;
  },
  renameEntry: async (path, name) => {
    const next = joinRelativePath(parentRelativePath(path), name);
    await fileSystemService.rename(path, next);
    await get().loadDirectory(parentRelativePath(path));
    set((state) => remapSelection(state, (item) => item === path ? next : item));
    return next;
  },
  deleteEntry: async (path) => {
    await fileSystemService.delete(path);
    await get().loadDirectory(parentRelativePath(path));
    set((state) => remapSelection(state, (item) => {
      if (item === path) return null;
      if (path && item.startsWith(`${path}/`)) return null;
      return item;
    }));
  },
  knownFiles: () => flattenProjectFiles(get().files)
    .filter((node) => node.kind === "file")
    .map((node) => ({
      name: node.name,
      path: node.path,
      relativePath: node.path,
      kind: "file" as const,
    })),
  reset: () => set({
    files: [],
    expanded: new Set<string>(),
    loadingPaths: new Set<string>(),
    status: null,
    ...singleSelection(null),
  }),
}));
