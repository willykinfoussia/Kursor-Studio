import { create } from "zustand";
import { fileName } from "../lib/filesystem/pathUtils";
import { languageFromPath } from "../lib/filesystem/languageFromPath";
import { fileSystemService } from "../lib/filesystem/FileSystemService";
import { isAccountVirtualPath, toUserSpecsRelative } from "../lib/graph/classify";
import { userDataApi } from "../lib/tauri/userDataApi";
import { useDialogStore } from "./dialogStore";
import type { EditorTab } from "../types/project";

interface EditorState {
  tabs: EditorTab[];
  activePath: string | null;
  closedTabs: string[];
  opening: boolean;
  saving: boolean;
  status: string | null;
  pendingReveal: { path: string; line?: number } | null;
  openFile: (path: string, pinned?: boolean, line?: number) => Promise<void>;
  setActive: (path: string) => void;
  activateAdjacentTab: (delta: number) => void;
  closeTab: (path: string) => Promise<boolean>;
  closeOthers: (path: string) => Promise<boolean>;
  closeAll: (force?: boolean) => Promise<boolean>;
  reopenClosedTab: () => Promise<void>;
  updateContent: (path: string, content: string) => void;
  saveTab: (path: string) => Promise<void>;
  saveActive: () => Promise<void>;
  saveAll: () => Promise<void>;
  renameTab: (from: string, to: string) => void;
  closePath: (path: string) => void;
  reloadTab: (path: string) => Promise<void>;
  handleExternalChange: (path: string) => Promise<void>;
  keepLocalChanges: () => void;
  reloadConflict: () => Promise<void>;
  hasDirtyTabs: () => boolean;
  clearReveal: () => void;
}

function pushClosed(closedTabs: string[], path: string) {
  return [...closedTabs.filter((item) => item !== path), path].slice(-20);
}

function toTab(path: string, content: string, pinned = false): EditorTab {
  return {
    id: path,
    path,
    name: fileName(path),
    language: languageFromPath(path),
    content,
    isDirty: false,
    pinned,
  };
}

const recentlySaved = new Map<string, number>();

function markSaved(path: string) {
  recentlySaved.set(path, Date.now());
}

function wasJustSaved(path: string) {
  const at = recentlySaved.get(path);
  return at !== undefined && Date.now() - at < 800;
}

async function readEditorFile(path: string): Promise<string> {
  if (isAccountVirtualPath(path)) {
    return userDataApi.read("specs", toUserSpecsRelative(path));
  }
  return fileSystemService.readFile(path);
}

async function writeEditorFile(path: string, content: string): Promise<void> {
  if (isAccountVirtualPath(path)) {
    await userDataApi.write("specs", toUserSpecsRelative(path), content);
    return;
  }
  await fileSystemService.writeFile(path, content);
}

async function confirmDirty(): Promise<boolean> {
  if (!useEditorStore.getState().hasDirtyTabs()) return true;
  const choice = await useDialogStore.getState().askUnsaved();
  if (choice === "cancel") return false;
  if (choice === "save") await useEditorStore.getState().saveAll();
  return true;
}

export const useEditorStore = create<EditorState>((set, get) => ({
  tabs: [],
  activePath: null,
  closedTabs: [],
  opening: false,
  saving: false,
  status: null,
  pendingReveal: null,
  openFile: async (path, pinned = false, line) => {
    const state = get();
    const existing = state.tabs.find((tab) => tab.path === path);
    if (existing) {
      set({
        activePath: path,
        tabs: state.tabs.map((tab) => tab.path === path && pinned ? { ...tab, pinned: true } : tab),
        status: null,
        pendingReveal: line ? { path, line } : null,
      });
      return;
    }
    set({ opening: true, status: "Opening file..." });
    try {
      if (fileSystemService.isBinaryPath(path)) {
        set({
          tabs: [...state.tabs, { ...toTab(path, "", pinned), binary: true }],
          activePath: path,
          opening: false,
          status: null,
          pendingReveal: line ? { path, line } : null,
        });
        return;
      }
      const content = await readEditorFile(path);
      set((current) => ({
        tabs: [...current.tabs, toTab(path, content, pinned)],
        activePath: path,
        opening: false,
        status: null,
        pendingReveal: line ? { path, line } : null,
      }));
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to read file.";
      const encodingError = message.includes("UTF-8");
      const binary = message.includes("Binary file");
      if (encodingError || binary) {
        set((current) => ({
          tabs: [...current.tabs, { ...toTab(path, "", pinned), binary, encodingError }],
          activePath: path,
          opening: false,
          status: null,
        }));
        return;
      }
      set({ opening: false, status: message });
    }
  },
  clearReveal: () => set({ pendingReveal: null }),
  setActive: (activePath) => set({ activePath, status: null }),
  activateAdjacentTab: (delta) => {
    const { tabs, activePath } = get();
    if (tabs.length === 0) return;
    const index = tabs.findIndex((tab) => tab.path === activePath);
    const next = (index < 0 ? 0 : index + delta + tabs.length) % tabs.length;
    set({ activePath: tabs[next]?.path ?? null, status: null });
  },
  closeTab: async (path) => {
    const tab = get().tabs.find((item) => item.path === path);
    if (!tab) return true;
    if (tab.isDirty) {
      const choice = await useDialogStore.getState().askUnsaved();
      if (choice === "cancel") return false;
      if (choice === "save") await get().saveTab(path);
    }
    set((state) => {
      const index = state.tabs.findIndex((item) => item.path === path);
      const tabs = state.tabs.filter((item) => item.path !== path);
      const activePath = state.activePath === path ? (tabs[Math.max(0, index - 1)]?.path ?? null) : state.activePath;
      return { tabs, activePath, closedTabs: pushClosed(state.closedTabs, path) };
    });
    return true;
  },
  closeOthers: async (path) => {
    const others = get().tabs.filter((tab) => tab.path !== path).map((tab) => tab.path);
    for (const other of others) {
      if (!get().tabs.some((tab) => tab.path === other)) continue;
      const closed = await get().closeTab(other);
      if (!closed) return false;
    }
    if (get().tabs.some((tab) => tab.path === path)) set({ activePath: path });
    return true;
  },
  closeAll: async (force = false) => {
    const paths = get().tabs.map((tab) => tab.path);
    if (paths.length === 0) return true;
    if (!force && !(await confirmDirty())) return false;
    set((state) => ({
      tabs: [],
      activePath: null,
      status: null,
      closedTabs: paths.reduce((closed, path) => pushClosed(closed, path), state.closedTabs),
    }));
    return true;
  },
  reopenClosedTab: async () => {
    const path = get().closedTabs[get().closedTabs.length - 1];
    if (!path) return;
    set((state) => ({ closedTabs: state.closedTabs.slice(0, -1) }));
    await get().openFile(path, true);
  },
  updateContent: (path, content) => set((state) => {
    const tab = state.tabs.find((item) => item.path === path);
    if (!tab || tab.content === content) return state;
    return {
      tabs: state.tabs.map((item) => item.path === path ? { ...item, content, isDirty: true } : item),
    };
  }),
  saveTab: async (path) => {
    const tab = get().tabs.find((item) => item.path === path);
    if (!tab || tab.binary || tab.encodingError) return;
    set({ saving: true, status: "Saving..." });
    try {
      await writeEditorFile(path, tab.content);
      markSaved(path);
      void import("./reviewStore").then(({ useReviewStore }) => useReviewStore.getState().noteDiskChange(path));
      set((state) => ({
        tabs: state.tabs.map((item) => item.path === path ? { ...item, isDirty: false } : item),
        saving: false,
        status: null,
      }));
    } catch (error) {
      set({
        saving: false,
        status: error instanceof Error ? error.message : "Unable to save file.",
      });
      throw error;
    }
  },
  saveActive: async () => {
    const path = get().activePath;
    if (path) await get().saveTab(path);
  },
  saveAll: async () => {
    for (const tab of get().tabs.filter((item) => item.isDirty)) {
      await get().saveTab(tab.path);
    }
  },
  renameTab: (from, to) => set((state) => ({
    tabs: state.tabs.map((tab) => tab.path === from ? { ...toTab(to, tab.content, tab.pinned), isDirty: tab.isDirty } : tab),
    activePath: state.activePath === from ? to : state.activePath,
  })),
  closePath: (path) => set((state) => {
    const tabs = state.tabs.filter((tab) => tab.path !== path && !tab.path.startsWith(`${path}/`));
    const activePath = tabs.some((tab) => tab.path === state.activePath) ? state.activePath : (tabs[tabs.length - 1]?.path ?? null);
    return { tabs, activePath };
  }),
  reloadTab: async (path) => {
    try {
      const content = await readEditorFile(path);
      set((state) => ({
        tabs: state.tabs.map((tab) => tab.path === path ? { ...tab, content, isDirty: false, binary: false, encodingError: false } : tab),
      }));
    } catch (error) {
      set({ status: error instanceof Error ? error.message : "Unable to read file." });
    }
  },
  handleExternalChange: async (path) => {
    if (wasJustSaved(path)) return;
    const tab = get().tabs.find((item) => item.path === path);
    if (!tab) return;
    if (tab.isDirty) {
      useDialogStore.getState().showConflict(path, tab.name);
      return;
    }
    await get().reloadTab(path);
  },
  keepLocalChanges: () => useDialogStore.getState().clearConflict(),
  reloadConflict: async () => {
    const conflict = useDialogStore.getState().conflict;
    if (!conflict) return;
    await get().reloadTab(conflict.path);
    useDialogStore.getState().clearConflict();
  },
  hasDirtyTabs: () => get().tabs.some((tab) => tab.isDirty),
}));
