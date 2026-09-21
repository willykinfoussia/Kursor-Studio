import { create } from "zustand";
import { agentRuntime } from "../lib/agent/AgentRuntime";
import { changeSetStats, type AiChangeSet, type AiFileChange, type HunkFilter, type ReviewConflictAction } from "../lib/review";
import { ReviewService } from "../lib/review/ReviewService";
import { createAiChangeStore } from "../lib/review/persist";
import { createReviewFiles } from "../lib/review/runtime";
import { useProjectStore } from "./projectStore";
import { useUiStore } from "./uiStore";
import { useSettingsStore } from "./settingsStore";
import { useDialogStore } from "./dialogStore";
import { useGitStore } from "./gitStore";
import { useAgentStore } from "./agentStore";
import { filterChangeSetsForConversation } from "../lib/review/ChangeTrackingService";

function tracking() {
  return agentRuntime.getChangeTracking();
}

function service() {
  return new ReviewService({
    files: createReviewFiles(),
    tracking: tracking(),
    persist: createAiChangeStore(),
    emit: (event) => agentRuntime.publish(event),
  });
}

function activeConversationId(): string | null {
  return useAgentStore.getState().activeConversationId ?? null;
}

function liveSets() {
  const projectId = useProjectStore.getState().currentProject?.id;
  const conversationId = activeConversationId();
  if (!projectId) return filterChangeSetsForConversation(tracking().listLive(), conversationId);
  return tracking().openForConversation(projectId, conversationId);
}

interface ReviewState {
  changeSets: AiChangeSet[];
  activeChangeSetId: string | null;
  selectedFileId: string | null;
  selectedHunkId: string | null;
  hunkFilter: HunkFilter;
  dockExpanded: boolean;
  focused: boolean;
  writingPath: string | null;
  error: string | null;
  conflict: { changeSetId: string; fileChangeId: string; reason: string } | null;
  hydrate: (projectId: string) => Promise<void>;
  ingest: (changeSet: AiChangeSet) => void;
  refresh: () => void;
  openReview: (changeSetId?: string, fileId?: string) => void;
  closeReview: () => void;
  selectFile: (fileId: string | null) => void;
  selectHunk: (hunkId: string | null) => void;
  setFilter: (filter: HunkFilter) => void;
  setDockExpanded: (expanded: boolean) => void;
  setFocused: (focused: boolean) => void;
  acceptAll: () => Promise<void>;
  rejectAll: () => Promise<void>;
  acceptFile: (fileId: string) => Promise<void>;
  rejectFile: (fileId: string) => Promise<void>;
  acceptHunk: (fileId: string, hunkId: string) => Promise<void>;
  rejectHunk: (fileId: string, hunkId: string) => Promise<void>;
  undoHunk: (fileId: string, hunkId: string) => Promise<void>;
  undoFile: (fileId: string) => Promise<void>;
  resolveConflict: (action: ReviewConflictAction) => Promise<void>;
  clearConflict: () => void;
  stageAccepted: () => Promise<void>;
  noteDiskChange: (path?: string) => Promise<void>;
}

function syncFrom(changeSet: AiChangeSet, fileId?: string | null): Partial<ReviewState> {
  const sets = liveSets();
  const visible = sets.find((item) => item.id === changeSet.id) ?? sets[0] ?? null;
  const files = visible?.files ?? [];
  const selected = (fileId && files.find((file) => file.id === fileId))
    || files.find((file) => file.status === "pending")
    || files[0];
  return {
    changeSets: sets,
    activeChangeSetId: visible?.id ?? null,
    selectedFileId: selected?.id ?? null,
    writingPath: tracking().writingPath,
  };
}

export const useReviewStore = create<ReviewState>((set, get) => ({
  changeSets: [],
  activeChangeSetId: null,
  selectedFileId: null,
  selectedHunkId: null,
  hunkFilter: "all",
  dockExpanded: false,
  focused: false,
  writingPath: null,
  error: null,
  conflict: null,
  hydrate: async (projectId) => {
    const loaded = await tracking().hydrate(projectId);
    const refreshed: AiChangeSet[] = [];
    for (const item of loaded) {
      refreshed.push(await service().refreshHashes(item).catch(() => item));
    }
    const visible = filterChangeSetsForConversation(refreshed, activeConversationId());
    set({
      changeSets: visible,
      activeChangeSetId: visible[0]?.id ?? null,
      selectedFileId: visible[0]?.files[0]?.id ?? null,
      writingPath: tracking().writingPath,
    });
  },
  ingest: (changeSet) => {
    set((state) => ({
      ...syncFrom(changeSet, state.selectedFileId),
      writingPath: tracking().writingPath,
    }));
  },
  refresh: () => {
    const sets = liveSets();
    set((state) => ({
      changeSets: sets,
      writingPath: tracking().writingPath,
      activeChangeSetId: sets.some((item) => item.id === state.activeChangeSetId)
        ? state.activeChangeSetId
        : sets[0]?.id ?? null,
    }));
  },
  openReview: (changeSetId, fileId) => {
    const changeSets = liveSets();
    const target = changeSets.find((item) => item.id === changeSetId) ?? changeSets[0] ?? null;
    set({
      changeSets,
      activeChangeSetId: target?.id ?? null,
      selectedFileId: fileId ?? target?.files[0]?.id ?? null,
      dockExpanded: true,
    });
    useUiStore.getState().setView("review");
    if (target) {
      agentRuntime.publish({
        type: "review-started",
        accountId: target.accountId,
        projectId: target.projectId,
        runId: target.runId,
        changeSetId: target.id,
        result: "ok",
      });
    }
  },
  closeReview: () => {
    useUiStore.getState().setView("project");
    set({ focused: false });
  },
  selectFile: (selectedFileId) => set({ selectedFileId, selectedHunkId: null }),
  selectHunk: (selectedHunkId) => set({ selectedHunkId }),
  setFilter: (hunkFilter) => set({ hunkFilter }),
  setDockExpanded: (dockExpanded) => set({ dockExpanded }),
  setFocused: (focused) => set({ focused }),
  acceptAll: async () => {
    const id = get().activeChangeSetId;
    if (!id) return;
    const ok = await useDialogStore.getState().askConfirm(
      "Accept all AI changes?",
      "This overwrites the workspace with the AI version of every pending file. Remaining conflicts open the merge dialog. It does not create a Git commit.",
      "Accept All",
      false,
    );
    if (!ok) return;
    const result = await service().acceptAll(id);
    const conflicted = result.changeSet.files.find((file) => file.status === "conflicted");
    if (result.conflict && conflicted) {
      get().openReview(result.changeSet.id, conflicted.id);
    }
    set({
      ...syncFrom(result.changeSet, conflicted?.id),
      error: result.ok ? null : (result.conflict ? null : result.reason ?? "Unable to accept all changes."),
      conflict: result.conflict && conflicted
        ? { changeSetId: result.changeSet.id, fileChangeId: conflicted.id, reason: result.reason ?? "Conflict" }
        : null,
    });
  },
  rejectAll: async () => {
    const id = get().activeChangeSetId;
    if (!id) return;
    const ok = await useDialogStore.getState().askConfirm(
      "Reject all AI changes?",
      "This restores the original AI-touched regions and preserves human edits when possible.",
      "Reject All",
      true,
    );
    if (!ok) return;
    const result = await service().rejectAll(id);
    set({
      ...syncFrom(result.changeSet),
      error: result.ok ? null : result.reason ?? "Unable to reject all changes.",
      conflict: result.conflict ? { changeSetId: result.changeSet.id, fileChangeId: get().selectedFileId ?? "", reason: result.reason ?? "Conflict" } : null,
    });
  },
  acceptFile: async (fileId) => {
    const id = get().activeChangeSetId;
    if (!id) return;
    const result = await service().acceptFile(id, fileId);
    set({
      ...syncFrom(result.changeSet, useSettingsStore.getState().reviewAdvanceOnDecision ? undefined : fileId),
      error: result.ok ? null : result.reason ?? null,
      conflict: result.conflict ? { changeSetId: result.changeSet.id, fileChangeId: fileId, reason: result.reason ?? "Conflict" } : null,
    });
  },
  rejectFile: async (fileId) => {
    const id = get().activeChangeSetId;
    if (!id) return;
    const result = await service().rejectFile(id, fileId);
    set({
      ...syncFrom(result.changeSet, useSettingsStore.getState().reviewAdvanceOnDecision ? undefined : fileId),
      error: result.ok ? null : result.reason ?? null,
      conflict: result.conflict ? { changeSetId: result.changeSet.id, fileChangeId: fileId, reason: result.reason ?? "Conflict" } : null,
    });
  },
  acceptHunk: async (fileId, hunkId) => {
    const id = get().activeChangeSetId;
    if (!id) return;
    const result = await service().acceptHunk(id, fileId, hunkId);
    set({
      ...syncFrom(result.changeSet, fileId),
      selectedHunkId: hunkId,
      error: result.ok ? null : result.reason ?? null,
      conflict: result.conflict ? { changeSetId: result.changeSet.id, fileChangeId: fileId, reason: result.reason ?? "Conflict" } : null,
    });
  },
  rejectHunk: async (fileId, hunkId) => {
    const id = get().activeChangeSetId;
    if (!id) return;
    const result = await service().rejectHunk(id, fileId, hunkId);
    set({
      ...syncFrom(result.changeSet, fileId),
      selectedHunkId: hunkId,
      error: result.ok ? null : result.reason ?? null,
      conflict: result.conflict ? { changeSetId: result.changeSet.id, fileChangeId: fileId, reason: result.reason ?? "Conflict" } : null,
    });
  },
  undoHunk: async (fileId, hunkId) => {
    const id = get().activeChangeSetId;
    if (!id) return;
    const result = await service().undo(id, "hunk", fileId, hunkId);
    set({ ...syncFrom(result.changeSet, fileId), selectedHunkId: hunkId, error: result.ok ? null : result.reason ?? null });
  },
  undoFile: async (fileId) => {
    const id = get().activeChangeSetId;
    if (!id) return;
    const result = await service().undo(id, "file", fileId);
    set({ ...syncFrom(result.changeSet, fileId), error: result.ok ? null : result.reason ?? null });
  },
  resolveConflict: async (action) => {
    const conflict = get().conflict;
    if (!conflict) return;
    const result = await service().resolveConflict(conflict.changeSetId, conflict.fileChangeId, action);
    set({
      ...syncFrom(result.changeSet, conflict.fileChangeId),
      conflict: result.conflict ? { ...conflict, reason: result.reason ?? "Conflict" } : null,
      error: result.ok ? null : result.reason ?? null,
    });
  },
  clearConflict: () => set({ conflict: null }),
  stageAccepted: async () => {
    const changeSet = tracking().get(get().activeChangeSetId ?? "");
    if (!changeSet) return;
    const paths = changeSet.files
      .filter((file) => file.status === "accepted" || file.status === "partially-accepted")
      .map((file) => file.path);
    if (paths.length === 0) return;
    await useGitStore.getState().stagePaths(paths);
    useGitStore.getState().setMode("changes");
    useUiStore.getState().setView("github");
  },
  noteDiskChange: async (path) => {
    const sets = liveSets();
    for (const changeSet of sets) {
      if (path && !changeSet.files.some((file) => file.path === path || file.previousPath === path)) continue;
      await service().refreshHashes(changeSet).catch(() => undefined);
    }
    get().refresh();
  },
}));

export function activeReviewChangeSet(state: ReviewState): AiChangeSet | null {
  return state.changeSets.find((item) => item.id === state.activeChangeSetId) ?? state.changeSets[0] ?? null;
}

export function selectedReviewFile(state: ReviewState): AiFileChange | null {
  const changeSet = activeReviewChangeSet(state);
  if (!changeSet) return null;
  return changeSet.files.find((file) => file.id === state.selectedFileId) ?? changeSet.files[0] ?? null;
}

export { changeSetStats, filterChangeSetsForConversation, liveSets };
