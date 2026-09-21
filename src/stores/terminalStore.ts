import { create } from "zustand";
import { sameFsPath } from "../lib/filesystem/pathUtils";
import { tauriTerminalService } from "../lib/terminal/TauriTerminalService";
import { tabLabelForShell } from "../lib/terminal/shellUtils";
import { useProjectStore } from "./projectStore";
import { useSettingsStore } from "./settingsStore";
import type { TerminalSession } from "../types/terminal";

interface TerminalState {
  sessions: TerminalSession[];
  activeId: string | null;
  visible: boolean;
  creating: boolean;
  status: string | null;
  createSession: () => Promise<void>;
  ensureSessionForCurrentProject: () => Promise<void>;
  setActive: (id: string) => void;
  closeSession: (id: string) => Promise<void>;
  killActive: () => Promise<void>;
  markExited: (id: string, exitCode: number | null) => void;
  closePanel: () => void;
  toggle: () => void;
  resetForNewProject: () => Promise<void>;
}

function hasSessionFor(sessions: TerminalSession[], rootPath: string) {
  return sessions.some((session) => sameFsPath(session.cwd, rootPath));
}

export const useTerminalStore = create<TerminalState>((set, get) => ({
  sessions: [],
  activeId: null,
  visible: true,
  creating: false,
  status: null,
  createSession: async () => {
    const project = useProjectStore.getState().currentProject;
    if (!project) {
      set({ status: "Open a project to start a terminal.", visible: true });
      return;
    }
    if (get().creating) return;
    set({ creating: true, visible: true, status: "Starting terminal..." });
    try {
      const shell = useSettingsStore.getState().terminalShell;
      const session = await tauriTerminalService.createSession(project.rootPath, shell);
      const next: TerminalSession = {
        id: session.id,
        name: tabLabelForShell(session.shell),
        shell: session.shell,
        cwd: session.cwd,
        projectId: project.id,
        status: "running",
      };
      set((state) => ({
        sessions: [...state.sessions, next],
        activeId: next.id,
        creating: false,
        status: null,
        visible: true,
      }));
    } catch (error) {
      set({
        creating: false,
        status: error instanceof Error ? error.message : "Unable to start terminal.",
      });
    }
  },
  ensureSessionForCurrentProject: async () => {
    const project = useProjectStore.getState().currentProject;
    if (!project) return;
    if (get().creating) return;
    if (hasSessionFor(get().sessions, project.rootPath)) return;
    await get().createSession();
  },
  setActive: (activeId) => set({ activeId }),
  closeSession: async (id) => {
    const session = get().sessions.find((item) => item.id === id);
    if (session?.status === "running") {
      try { await tauriTerminalService.kill(id); } catch { /* already gone */ }
    }
    set((state) => {
      const sessions = state.sessions.filter((item) => item.id !== id);
      return { sessions, activeId: state.activeId === id ? (sessions[sessions.length - 1]?.id ?? null) : state.activeId };
    });
  },
  killActive: async () => {
    const id = get().activeId;
    if (!id) return;
    try {
      await tauriTerminalService.kill(id);
    } catch (error) {
      set({ status: error instanceof Error ? error.message : "Unable to stop the terminal." });
    }
  },
  markExited: (id, exitCode) => set((state) => ({
    sessions: state.sessions.map((session) => session.id === id
      ? { ...session, status: "exited", exitCode: exitCode ?? undefined }
      : session),
  })),
  closePanel: () => set({ visible: false }),
  toggle: () => set((state) => ({ visible: !state.visible })),
  resetForNewProject: async () => {
    const previous = get().sessions;
    for (const session of previous) {
      if (session.status === "running") {
        try { await tauriTerminalService.kill(session.id); } catch { /* already gone */ }
      }
    }
    set({ sessions: [], activeId: null, status: null });
    await get().ensureSessionForCurrentProject();
  },
}));
