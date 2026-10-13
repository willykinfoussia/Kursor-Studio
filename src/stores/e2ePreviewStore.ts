import { create } from "zustand";
import type { TestLevelProgress } from "../lib/testing/progress";
import { useProjectViewStore } from "./projectViewStore";

interface E2ePreviewState {
  visible: boolean;
  requestId: string | null;
  anchorId: string | null;
  progress: TestLevelProgress | null;
  present: (progress: TestLevelProgress & { requestId: string }) => void;
  dismiss: () => void;
}

export const useE2ePreviewStore = create<E2ePreviewState>((set, get) => ({
  visible: false,
  requestId: null,
  anchorId: null,
  progress: null,
  present: (progress) => {
    const view = useProjectViewStore.getState();
    if (view.surface !== "split") view.revealPreview();
    const anchorId = useProjectViewStore.getState().activeArtifactId;
    const current = get();
    set({
      visible: true,
      requestId: progress.requestId,
      anchorId: current.visible ? current.anchorId : anchorId,
      progress: {
        ...progress,
        screenshotPath: progress.screenshotPath ?? current.progress?.screenshotPath ?? null,
        videoPath: progress.videoPath ?? current.progress?.videoPath ?? null,
      },
    });
  },
  dismiss: () => {
    const view = useProjectViewStore.getState();
    set({ visible: false });
    if (view.artifacts.length === 0 && !view.launchCommand && view.runtime.status === "idle") view.hide();
  },
}));
