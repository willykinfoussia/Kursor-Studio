import { useEffect } from "react";
import { useAgentStore } from "../stores/agentStore";
import { useProjectStore } from "../stores/projectStore";
import { refreshProjectView, scheduleProjectViewRefresh } from "../lib/projectView/session";

export function useProjectView() {
  const projectId = useProjectStore((state) => state.currentProject?.id ?? null);
  const filesChanged = useAgentStore((state) => state.filesChanged);

  useEffect(() => {
    void refreshProjectView();
  }, [projectId]);

  useEffect(() => {
    if (!projectId) return;
    scheduleProjectViewRefresh();
  }, [projectId, filesChanged]);
}
