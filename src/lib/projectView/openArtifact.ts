import { resolveProjectPath } from "../filesystem/pathUtils";
import { projectApi } from "../tauri/projectApi";
import { isTauri } from "../tauri/invoke";
import { useProjectStore } from "../../stores/projectStore";

export async function revealArtifact(relativePath: string) {
  if (!relativePath) return;
  await projectApi.reveal(relativePath);
}

export async function openArtifactExternal(relativePath: string) {
  if (!relativePath || !isTauri()) return;
  const root = useProjectStore.getState().currentProject?.rootPath;
  if (!root) return;
  const absolute = resolveProjectPath(root, relativePath);
  const { openPath } = await import("@tauri-apps/plugin-opener");
  await openPath(absolute);
}
