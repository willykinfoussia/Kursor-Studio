import { useEffect, useMemo, useState } from "react";
import {
  ChevronDown, ChevronRight, File, FileCode2, FileJson, FileText,
  Folder, FolderOpen, Pencil, Plus, Trash2, Copy, FolderPlus, ExternalLink,
} from "lucide-react";
import type { ProjectFile } from "../../types/project";
import { useFileExplorerStore } from "../../stores/fileExplorerStore";
import { useEditorStore } from "../../stores/editorStore";
import { useDialogStore } from "../../stores/dialogStore";
import { useProjectStore } from "../../stores/projectStore";
import { useRagStore } from "../../stores/ragStore";
import { findProjectFile, pruneNestedPaths } from "../../lib/explorer/treeSelection";
import { parentRelativePath } from "../../lib/filesystem/pathUtils";
import { projectApi } from "../../lib/tauri/projectApi";
import { pickAndOpenProject } from "../../lib/project/workspaceActions";
import { IconButton } from "../ui/Controls";

function FileIcon({ file }: { file: ProjectFile }) {
  if (file.kind === "directory") return <Folder size={14} className="file-icon folder-icon" />;
  if (file.name.endsWith(".tsx") || file.name.endsWith(".ts")) return <FileCode2 size={14} className="file-icon tsx-icon" />;
  if (file.name.endsWith(".json")) return <FileJson size={14} className="file-icon json-icon" />;
  if (file.name.endsWith(".md")) return <FileText size={14} className="file-icon md-icon" />;
  return <File size={14} className="file-icon" />;
}

interface MenuState { x: number; y: number; file: ProjectFile; paths: string[] }

function scrollPrimaryIntoView(id: string) {
  document.querySelector<HTMLElement>(`[data-tree-id="${CSS.escape(id)}"]`)?.scrollIntoView({ block: "nearest" });
}

function TreeNode({
  file,
  depth,
  selectedPaths,
  onMenu,
}: {
  file: ProjectFile;
  depth: number;
  selectedPaths: Set<string>;
  onMenu: (event: React.MouseEvent, file: ProjectFile) => void;
}) {
  const expanded = useFileExplorerStore((state) => state.expanded);
  const toggleExpanded = useFileExplorerStore((state) => state.toggleExpanded);
  const selectFile = useFileExplorerStore((state) => state.selectFile);
  const toggleSelect = useFileExplorerStore((state) => state.toggleSelect);
  const selectRange = useFileExplorerStore((state) => state.selectRange);
  const openFile = useEditorStore((state) => state.openFile);
  const isExpanded = expanded.has(file.id);
  const isDirectory = file.kind === "directory";
  const selected = selectedPaths.has(file.path);

  const activate = (event: React.MouseEvent) => {
    (event.currentTarget.closest("[data-project-tree]") as HTMLElement | null)?.focus();
    if (event.shiftKey) {
      selectRange(file.path);
      return;
    }
    if (event.ctrlKey || event.metaKey) {
      toggleSelect(file.path);
      return;
    }
    selectFile(file.path);
    if (isDirectory) void toggleExpanded(file.id);
    else void openFile(file.path, false);
  };

  return (
    <>
      <div
        className={`tree-row ${selected ? "selected" : ""} ${file.id === "root" ? "root" : ""}`}
        style={{ paddingLeft: 5 + depth * 13 }}
        data-tree-id={file.id}
        onClick={activate}
        onDoubleClick={() => {
          if (!isDirectory) void openFile(file.path, true);
        }}
        onContextMenu={(event) => onMenu(event, file)}
        role="treeitem"
        aria-selected={selected}
      >
        <span className="tree-chevron">
          {isDirectory && (isExpanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />)}
        </span>
        {isDirectory && isExpanded ? <FolderOpen size={14} className="file-icon folder-icon" /> : <FileIcon file={file} />}
        <span>{file.name}</span>
      </div>
      {isDirectory && isExpanded && file.children?.map((child) => (
        <TreeNode key={child.id} file={child} depth={depth + 1} selectedPaths={selectedPaths} onMenu={onMenu} />
      ))}
    </>
  );
}

export function ProjectExplorer() {
  const files = useFileExplorerStore((state) => state.files);
  const status = useFileExplorerStore((state) => state.status);
  const selectedFiles = useFileExplorerStore((state) => state.selectedFiles);
  const createEntry = useFileExplorerStore((state) => state.createEntry);
  const renameEntry = useFileExplorerStore((state) => state.renameEntry);
  const deleteEntry = useFileExplorerStore((state) => state.deleteEntry);
  const currentProject = useProjectStore((state) => state.currentProject);
  const isLoading = useProjectStore((state) => state.isLoading);
  const indexing = useRagStore((state) => state.indexing);
  const indexedDone = useRagStore((state) => state.done);
  const indexedTotal = useRagStore((state) => state.total);
  const openFile = useEditorStore((state) => state.openFile);
  const renameTab = useEditorStore((state) => state.renameTab);
  const closePath = useEditorStore((state) => state.closePath);
  const askPrompt = useDialogStore((state) => state.askPrompt);
  const askConfirm = useDialogStore((state) => state.askConfirm);
  const [menu, setMenu] = useState<MenuState | null>(null);
  const selectedPaths = useMemo(() => new Set(selectedFiles), [selectedFiles]);

  useEffect(() => {
    const close = () => setMenu(null);
    window.addEventListener("click", close);
    window.addEventListener("blur", close);
    return () => { window.removeEventListener("click", close); window.removeEventListener("blur", close); };
  }, []);

  const parentPathOf = (file: ProjectFile) => file.kind === "directory" ? file.path : file.path.split("/").slice(0, -1).join("/");

  const makeEntry = async (parent: ProjectFile, kind: "file" | "directory") => {
    const parentPath = parentPathOf(parent);
    const name = await askPrompt(kind === "file" ? "New file name:" : "New folder name:");
    if (!name?.trim()) return;
    const path = await createEntry(parentPath, kind, name.trim());
    if (kind === "file") await openFile(path, true);
  };

  const renamePrimary = async (file: ProjectFile) => {
    const name = await askPrompt("Rename", file.name);
    if (!name?.trim() || name.trim() === file.name) return;
    const next = await renameEntry(file.path, name.trim());
    renameTab(file.path, next);
  };

  const deletePaths = async (paths: string[]) => {
    const targets = pruneNestedPaths(paths.filter((path) => path !== ""));
    if (targets.length === 0) return;
    const title = targets.length === 1
      ? `Delete "${findProjectFile(files, targets[0]!)?.name ?? targets[0]}"?`
      : `Delete ${targets.length} items?`;
    const message = targets.length === 1
      ? `This will permanently delete this ${findProjectFile(files, targets[0]!)?.kind === "directory" ? "directory" : "file"}.`
      : "This will permanently delete the selected files and folders.";
    const ok = await askConfirm(title, message, "Delete", true);
    if (!ok) return;
    for (const path of targets) {
      await deleteEntry(path);
      closePath(path);
    }
  };

  const copyPaths = (paths: string[]) => {
    const text = paths.map((path) => path || ".").join("\n");
    void navigator.clipboard?.writeText(text);
  };

  const openMenu = (event: React.MouseEvent, file: ProjectFile) => {
    event.preventDefault();
    const store = useFileExplorerStore.getState();
    if (!store.selectedFiles.includes(file.path)) store.selectFile(file.path);
    const paths = useFileExplorerStore.getState().selectedFiles;
    setMenu({ x: event.clientX, y: event.clientY, file, paths });
  };

  const handleHorizontal = (expand: boolean) => {
    const store = useFileExplorerStore.getState();
    const path = store.selectedFile;
    if (path == null) return;
    const file = findProjectFile(store.files, path);
    if (!file) return;
    if (file.kind === "directory") {
      const isExpanded = store.expanded.has(file.id);
      if (expand && !isExpanded) {
        void store.toggleExpanded(file.id);
        return;
      }
      if (!expand && isExpanded) {
        void store.toggleExpanded(file.id);
        return;
      }
      if (expand && isExpanded && file.children?.[0]) {
        store.selectFile(file.children[0].path);
        scrollPrimaryIntoView(file.children[0].id);
        return;
      }
    }
    if (!expand && file.id !== "root") {
      const parentPath = parentRelativePath(file.path);
      store.selectFile(parentPath);
      const parent = findProjectFile(store.files, parentPath || "root");
      if (parent) scrollPrimaryIntoView(parent.id);
    }
  };

  const handleTreeKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const store = useFileExplorerStore.getState();
    const modifier = event.ctrlKey || event.metaKey;

    if (modifier && event.key.toLowerCase() === "a") {
      event.preventDefault();
      store.selectAllVisible();
      return;
    }
    if (modifier && event.key.toLowerCase() === "c") {
      event.preventDefault();
      copyPaths(store.selectedFiles);
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      if (menu) {
        setMenu(null);
        return;
      }
      store.clearToPrimary();
      return;
    }
    if (event.key === "Delete") {
      event.preventDefault();
      void deletePaths(store.selectedFiles);
      return;
    }
    if (event.key === "F2") {
      event.preventDefault();
      if (store.selectedFiles.length !== 1 || store.selectedFile == null) return;
      const file = findProjectFile(store.files, store.selectedFile);
      if (file) void renamePrimary(file);
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      const file = store.selectedFile != null ? findProjectFile(store.files, store.selectedFile) : undefined;
      if (!file) return;
      if (file.kind === "directory") void store.toggleExpanded(file.id);
      else void openFile(file.path, false);
      return;
    }
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      store.moveSelection(event.key === "ArrowDown" ? 1 : -1, event.shiftKey);
      const next = useFileExplorerStore.getState();
      const file = next.selectedFile != null ? findProjectFile(next.files, next.selectedFile) : undefined;
      if (file) scrollPrimaryIntoView(file.id);
      return;
    }
    if (event.key === "Home" || event.key === "End") {
      event.preventDefault();
      store.selectVisibleEdge(event.key === "Home" ? "start" : "end", event.shiftKey);
      const next = useFileExplorerStore.getState();
      const file = next.selectedFile != null ? findProjectFile(next.files, next.selectedFile) : undefined;
      if (file) scrollPrimaryIntoView(file.id);
      return;
    }
    if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
      event.preventDefault();
      handleHorizontal(event.key === "ArrowRight");
    }
  };

  return (
    <aside className="sidebar">
      <header className="section-header">
        <span>PROJECT</span>
        <IconButton icon={Plus} label="Nouveau fichier" size={14} disabled={!files[0]} onClick={() => files[0] && void makeEntry(files[0], "file")} />
      </header>
      <div className="tree" role="tree" tabIndex={0} data-project-tree onKeyDown={handleTreeKeyDown}>
        {isLoading || status === "Loading project..." ? (
          <div className="tree-status">Loading project...</div>
        ) : !currentProject ? (
          <div className="tree-empty">
            <p>Open a project to browse files.</p>
            <button type="button" className="primary-btn" onClick={() => void pickAndOpenProject()}>Open Project</button>
          </div>
        ) : (
          files.map((file) => (
            <TreeNode key={file.id} file={file} depth={0} selectedPaths={selectedPaths} onMenu={openMenu} />
          ))
        )}
        {status && status !== "Loading project..." && status !== "Loading files..." && (
          <div className="tree-status error">{status}</div>
        )}
      </div>
      {menu && (
        <div className="context-menu" style={{ left: menu.x, top: menu.y }} onClick={(event) => event.stopPropagation()}>
          <button className="context-item" onClick={() => { void makeEntry(menu.file, "file"); setMenu(null); }}><Plus size={13} /> New File</button>
          <button className="context-item" onClick={() => { void makeEntry(menu.file, "directory"); setMenu(null); }}><FolderPlus size={13} /> New Folder</button>
          <button
            className="context-item"
            disabled={menu.paths.length > 1}
            onClick={() => {
              if (menu.paths.length > 1) return;
              void renamePrimary(menu.file);
              setMenu(null);
            }}
          >
            <Pencil size={13} /> Rename
          </button>
          <button className="context-item" onClick={() => { copyPaths(menu.paths); setMenu(null); }}><Copy size={13} /> Copy Path</button>
          <button className="context-item" onClick={() => { void projectApi.reveal(menu.file.path); setMenu(null); }}><ExternalLink size={13} /> Open in File Manager</button>
          <button className="context-item danger" onClick={() => {
            void deletePaths(menu.paths);
            setMenu(null);
          }}><Trash2 size={13} /> Delete</button>
        </div>
      )}
      {indexing && indexedTotal > 0 && (
        <div className="tree-index">
          <strong>Indexing project…</strong> {indexedDone}/{indexedTotal} files
        </div>
      )}
    </aside>
  );
}
