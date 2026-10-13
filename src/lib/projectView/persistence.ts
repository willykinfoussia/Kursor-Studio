import type { PersistedWorkspace, WorkspaceSurface } from "./types";

const STORAGE_KEY = "kursor.projectView.v1";

export interface KeyValueStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

type WorkspaceMap = Record<string, PersistedWorkspace>;

export function loadWorkspace(projectId: string, storage: KeyValueStorage): PersistedWorkspace | null {
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as WorkspaceMap;
    const entry = parsed[projectId];
    if (!entry || !isSurface(entry.surface) || (entry.control !== "automatic" && entry.control !== "manual")) return null;
    if (typeof entry.splitPercent !== "number") return null;
    return {
      control: entry.control,
      surface: entry.surface,
      activeArtifactId: typeof entry.activeArtifactId === "string" ? entry.activeArtifactId : null,
      splitPercent: entry.splitPercent,
    };
  } catch {
    return null;
  }
}

export function saveWorkspace(projectId: string, value: PersistedWorkspace, storage: KeyValueStorage) {
  let current: WorkspaceMap = {};
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (raw) current = JSON.parse(raw) as WorkspaceMap;
  } catch {
    current = {};
  }
  current[projectId] = value;
  storage.setItem(STORAGE_KEY, JSON.stringify(current));
}

function isSurface(value: unknown): value is WorkspaceSurface {
  return value === "chat" || value === "split" || value === "code";
}
