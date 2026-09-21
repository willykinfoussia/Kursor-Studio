import { invokeCommand, isTauri } from "../../tauri/invoke";
import type { BlenderInstallation, DetectedExecutable, SystemDetector } from "./types";

export class TauriSystemDetector implements SystemDetector {
  async which(name: string): Promise<DetectedExecutable> {
    if (!isTauri()) return { name, found: false };
    return invokeCommand<DetectedExecutable>("mcp_which", { name }, { name, found: false });
  }

  async detectBlender(): Promise<BlenderInstallation | null> {
    if (!isTauri()) return null;
    return invokeCommand<BlenderInstallation | null>("mcp_detect_blender", undefined, null);
  }

  async probeTcp(host: string, port: number): Promise<boolean> {
    if (!isTauri()) return false;
    return invokeCommand<boolean>("mcp_probe_tcp", { host, port }, false);
  }

  async pickDirectory(title = "Choose folder") {
    if (!isTauri()) return null;
    const { open } = await import("@tauri-apps/plugin-dialog");
    const selected = await open({ directory: true, multiple: false, title });
    if (Array.isArray(selected)) return selected[0] ?? null;
    return selected;
  }

  async pickFile(title = "Choose file", filters?: Array<{ name: string; extensions: string[] }>) {
    if (!isTauri()) return null;
    const { open } = await import("@tauri-apps/plugin-dialog");
    const selected = await open({ directory: false, multiple: false, title, filters });
    if (Array.isArray(selected)) return selected[0] ?? null;
    return typeof selected === "string" ? selected : null;
  }
}

export class MemorySystemDetector implements SystemDetector {
  executables = new Map<string, DetectedExecutable>();
  blender: BlenderInstallation | null = null;
  tcp = new Set<string>();
  directories: string[] = [];
  files: string[] = [];

  async which(name: string) {
    return this.executables.get(name) ?? { name, found: false };
  }

  async detectBlender() {
    return this.blender;
  }

  async probeTcp(host: string, port: number) {
    return this.tcp.has(`${host}:${port}`);
  }

  async pickDirectory() {
    return this.directories.shift() ?? null;
  }

  async pickFile() {
    return this.files.shift() ?? null;
  }
}

export const systemDetector: SystemDetector = new TauriSystemDetector();

export async function locateExecutable(name: string, detector: SystemDetector = systemDetector) {
  return detector.which(name);
}
