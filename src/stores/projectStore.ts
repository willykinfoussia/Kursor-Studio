import { create } from "zustand";
import { projectService } from "../lib/project/ProjectService";
import { projectSettingsRepository } from "../lib/storage/settingsRepository";
import { setProjectRootGetter } from "../lib/filesystem/FileSystemService";
import { isTauri } from "../lib/tauri/invoke";
import type { Project } from "../types/project";

interface ProjectState {
  currentProject: Project | null;
  recentProjects: Project[];
  projects: Project[];
  isLoading: boolean;
  error: string | null;
  unavailable: Project | null;
  projectSettings: Record<string, unknown>;
  gitStatus: { branch: string; changedFiles: number; clean: boolean; ahead: number; behind: number } | null;
  gitError: string | null;
  openProject: (path: string) => Promise<Project>;
  switchProject: (path: string) => Promise<Project>;
  closeProject: () => void;
  createProject: (path: string) => Promise<Project>;
  removeProject: (id: string) => Promise<void>;
  loadProjects: () => Promise<void>;
  loadRecents: () => Promise<void>;
  refreshProjects: () => Promise<void>;
  setUnavailable: (project: Project | null) => void;
  setGitStatus: (status: ProjectState["gitStatus"]) => void;
  setGitError: (error: string | null) => void;
  patchCurrentProject: (patch: Partial<Project>) => void;
  loadProjectSettings: (projectId: string) => Promise<void>;
  updateProjectSetting: (key: string, value: unknown) => void;
  clearError: () => void;
}

function parseStored(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

export const useProjectStore = create<ProjectState>((set, get) => ({
  currentProject: null,
  recentProjects: [],
  projects: [],
  isLoading: false,
  error: null,
  unavailable: null,
  projectSettings: {},
  gitStatus: null,
  gitError: null,
  openProject: async (path) => {
    set({ isLoading: true, error: null, unavailable: null });
    try {
      const project = await projectService.open(path);
      const recents = [project, ...get().recentProjects.filter((item) => item.id !== project.id)].slice(0, 12);
      const projects = [project, ...get().projects.filter((item) => item.id !== project.id)];
      set({ currentProject: project, recentProjects: recents, projects, isLoading: false });
      await get().loadProjectSettings(project.id);
      return project;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Project directory no longer exists.";
      set({ isLoading: false, error: message });
      throw error;
    }
  },
  switchProject: async (path) => get().openProject(path),
  closeProject: () => set({ currentProject: null, projectSettings: {}, gitStatus: null, gitError: null }),
  createProject: async (path) => {
    await projectService.createFolder(path);
    return get().openProject(path);
  },
  removeProject: async (id) => {
    await projectService.remove(id);
    set((state) => ({
      projects: state.projects.filter((item) => item.id !== id),
      recentProjects: state.recentProjects.filter((item) => item.id !== id),
      currentProject: state.currentProject?.id === id ? null : state.currentProject,
    }));
  },
  loadProjects: async () => {
    const projects = await projectService.list();
    set({ projects });
  },
  loadRecents: async () => {
    const recentProjects = await projectService.listRecent();
    set({ recentProjects });
  },
  refreshProjects: async () => {
    await Promise.all([get().loadRecents(), get().loadProjects()]);
  },
  setUnavailable: (unavailable) => set({ unavailable }),
  setGitStatus: (gitStatus) => set({ gitStatus }),
  setGitError: (gitError) => set({ gitError }),
  patchCurrentProject: (patch) => set((state) => ({
    currentProject: state.currentProject ? { ...state.currentProject, ...patch } : null,
  })),
  loadProjectSettings: async (projectId) => {
    try {
      const records = await projectSettingsRepository.list(projectId);
      const projectSettings: Record<string, unknown> = {};
      for (const record of records) projectSettings[record.key] = parseStored(record.value);
      set({ projectSettings });
    } catch {
      set({ projectSettings: {} });
    }
  },
  updateProjectSetting: (key, value) => {
    const project = get().currentProject;
    set({ projectSettings: { ...get().projectSettings, [key]: value } });
    if (project && isTauri()) void projectSettingsRepository.set(project.id, key, value);
  },
  clearError: () => set({ error: null }),
}));

setProjectRootGetter(() => useProjectStore.getState().currentProject?.rootPath ?? null);
