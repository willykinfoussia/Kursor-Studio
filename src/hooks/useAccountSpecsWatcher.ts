import { useEffect } from "react";
import { fromUserSpecsRelative } from "../lib/graph/classify";
import { graphService } from "../lib/graph/GraphService";
import { userDataApi } from "../lib/tauri/userDataApi";
import { useEditorStore } from "../stores/editorStore";
import { useProjectStore } from "../stores/projectStore";

export function useAccountSpecsWatcher() {
  const projectId = useProjectStore((state) => state.currentProject?.id);

  useEffect(() => {
    let disposed = false;
    let unwatch: () => void = () => {};
    let timer: number | undefined;
    const pending = new Map<string, string>();

    void userDataApi.watchSpecs((event) => {
      if (disposed || !event.relativePath) return;
      const relative = event.relativePath.replace(/\\/g, "/");
      if (!relative.startsWith("account/")) return;
      const virtual = fromUserSpecsRelative(relative);
      pending.set(virtual, event.kind);
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        const changes = [...pending.entries()];
        pending.clear();
        const activeProject = useProjectStore.getState().currentProject?.id;
        for (const [path, kind] of changes) {
          void useEditorStore.getState().handleExternalChange(path);
          if (!activeProject) continue;
          void graphService.updateFile(activeProject, path, kind === "remove" ? "remove" : kind);
        }
      }, 160);
    }).then((fn) => {
      if (disposed) fn();
      else unwatch = fn;
    });

    return () => {
      disposed = true;
      window.clearTimeout(timer);
      unwatch();
    };
  }, [projectId]);
}
