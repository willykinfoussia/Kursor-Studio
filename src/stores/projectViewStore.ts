import { create } from "zustand";
import { loadWorkspace, saveWorkspace, type KeyValueStorage } from "../lib/projectView/persistence";
import {
  initialWorkspace,
  persistedFrom,
  reduceWorkspace,
  type WorkspaceAction,
  type WorkspaceSnapshot,
} from "../lib/projectView/transitions";
import type { PersistedWorkspace, ProjectArtifact, ProjectCategory, RuntimeSnapshot, RuntimeStatus } from "../lib/projectView/types";
import { useAgentStore } from "./agentStore";
import { useProjectStore } from "./projectStore";

interface ProjectViewStore extends WorkspaceSnapshot {
  hydrate: (input: {
    projectId: string;
    persisted: PersistedWorkspace | null;
    artifacts: ProjectArtifact[];
    category: ProjectCategory;
    launchCommand: string | null;
  }) => void;
  sync: (input: { artifacts: ProjectArtifact[]; category: ProjectCategory; launchCommand: string | null }) => void;
  applyRuntime: (runtime: Partial<RuntimeSnapshot> & { status: RuntimeStatus }) => void;
  hide: () => void;
  show: () => void;
  follow: () => void;
  select: (artifactId: string) => void;
  step: (direction: -1 | 1) => void;
  focus: (artifactId: string) => void;
  openCode: () => void;
  openProject: () => void;
  revealPreview: () => void;
  showPlan: (path: string) => void;
  setSplit: (splitPercent: number, width?: number) => void;
  reset: () => void;
}

function browserStorage(): KeyValueStorage | null {
  if (typeof localStorage === "undefined") return null;
  return localStorage;
}

function apply(get: () => ProjectViewStore, set: (partial: Partial<ProjectViewStore>) => void, action: WorkspaceAction) {
  const result = reduceWorkspace(get(), action);
  set(result.state);
  const projectId = result.state.projectId ?? useProjectStore.getState().currentProject?.id;
  const storage = browserStorage();
  if (projectId && storage && action.type !== "reset") {
    saveWorkspace(projectId, persistedFrom(result.state), storage);
  }
  for (const notice of result.notices) {
    useAgentStore.getState().pushArtifactNotice(notice.text, notice.artifactId);
  }
}

export const useProjectViewStore = create<ProjectViewStore>((set, get) => ({
  ...initialWorkspace(),
  hydrate: (input) => apply(get, set, { type: "hydrate", ...input }),
  sync: (input) => apply(get, set, { type: "sync-artifacts", ...input }),
  applyRuntime: (runtime) => apply(get, set, { type: "runtime", runtime }),
  hide: () => apply(get, set, { type: "hide" }),
  show: () => apply(get, set, { type: "show" }),
  follow: () => apply(get, set, { type: "follow" }),
  select: (artifactId) => apply(get, set, { type: "select", artifactId }),
  step: (direction) => apply(get, set, { type: "step", direction }),
  focus: (artifactId) => apply(get, set, { type: "focus", artifactId }),
  openCode: () => apply(get, set, { type: "open-code" }),
  openProject: () => apply(get, set, { type: "open-project" }),
  revealPreview: () => apply(get, set, { type: "reveal-preview" }),
  showPlan: (path) => apply(get, set, { type: "show-plan", path }),
  setSplit: (splitPercent, width) => apply(get, set, { type: "set-split", splitPercent, width }),
  reset: () => apply(get, set, { type: "reset" }),
}));

export function readPersistedWorkspace(projectId: string) {
  const storage = browserStorage();
  if (!storage) return null;
  return loadWorkspace(projectId, storage);
}
