import { FILE_MUTATE_TOOLS } from "./recovery/types";
import { parentRelativePath } from "../filesystem/pathUtils";
import { useEditorStore } from "../../stores/editorStore";
import { useFileExplorerStore } from "../../stores/fileExplorerStore";

export function shouldApplyAgentFileChange(tool: string): boolean {
  return FILE_MUTATE_TOOLS.has(tool);
}

export async function applyAgentFileChange(path: string) {
  await useFileExplorerStore.getState().refreshPath(parentRelativePath(path));
  const editor = useEditorStore.getState();
  if (editor.tabs.some((tab) => tab.path === path)) {
    await editor.reloadTab(path);
    return;
  }
  await editor.openFile(path);
}
