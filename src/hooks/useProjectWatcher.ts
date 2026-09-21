import { useEffect } from "react";
import { fileSystemService } from "../lib/filesystem/FileSystemService";
import { parentRelativePath } from "../lib/filesystem/pathUtils";
import { ragService } from "../lib/rag/RagService";
import { graphService } from "../lib/graph/GraphService";
import { isGraphCachePath } from "../lib/graph/scanner/FileScanner";
import { useEditorStore } from "../stores/editorStore";
import { useFileExplorerStore } from "../stores/fileExplorerStore";
import { useProjectStore } from "../stores/projectStore";

export function useProjectWatcher() {
  const projectId = useProjectStore((state) => state.currentProject?.id);

  useEffect(() => {
    if (!projectId) return;
    let disposed = false;
    let unwatch: () => void = () => {};
    let timer: number | undefined;
    const pending = new Set<string>();

    void fileSystemService.watch("", (event) => {
      if (disposed || !event.relativePath) return;
      pending.add(event.relativePath);
      pending.add(parentRelativePath(event.relativePath));
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        const paths = [...pending];
        pending.clear();
        for (const path of paths) {
          void useFileExplorerStore.getState().refreshPath(path);
          void useEditorStore.getState().handleExternalChange(path);
          void import("../stores/reviewStore").then(({ useReviewStore }) => useReviewStore.getState().noteDiskChange(path));
          void import("../stores/planStore").then(({ usePlanStore }) => usePlanStore.getState().noteDiskChange(path));
          if (event.kind === "remove") void ragService.removeFile(projectId, path);
          else if (!path.endsWith("/") && path.includes(".")) void ragService.indexFile(projectId, path);
          if (!isGraphCachePath(path)) {
            void graphService.updateFile(projectId, path, event.kind === "remove" ? "remove" : event.kind);
          }
        }
        void import("../stores/gitStore").then(({ useGitStore }) => useGitStore.getState().refreshStatus());
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
