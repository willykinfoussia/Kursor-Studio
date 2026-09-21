import { invokeCommand, isTauri } from "./invoke";

export type SkillPackNativeFile = {
  relativePath: string;
  content: string;
};

export async function pickSkillPackDirectory(): Promise<string | null> {
  if (!isTauri()) return null;
  const { open } = await import("@tauri-apps/plugin-dialog");
  const selected = await open({
    directory: true,
    multiple: false,
    title: "Import skill folder",
  });
  if (Array.isArray(selected)) return selected[0] ?? null;
  return selected;
}

export async function readSkillPackDirectory(path: string) {
  return invokeCommand<SkillPackNativeFile[]>("skill_pack_read", { path }, []);
}
