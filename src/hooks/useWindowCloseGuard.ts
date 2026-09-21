import { useEffect } from "react";
import { isTauri } from "../lib/tauri/invoke";
import { useEditorStore } from "../stores/editorStore";

export function useWindowCloseGuard() {
  useEffect(() => {
    if (!isTauri()) return;
    let unlisten: (() => void) | undefined;
    void import("@tauri-apps/api/window").then(async ({ getCurrentWindow }) => {
      const current = getCurrentWindow();
      unlisten = await current.onCloseRequested(async (event) => {
        if (!useEditorStore.getState().hasDirtyTabs()) return;
        event.preventDefault();
        const closed = await useEditorStore.getState().closeAll();
        if (closed) await current.destroy();
      });
    });
    return () => unlisten?.();
  }, []);
}
