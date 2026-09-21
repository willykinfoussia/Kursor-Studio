import { blenderSettings, type BlenderSettings } from "../builtin/blender";
import { openExternalUrl } from "../../tauri/openUrl";
import { resolveUserPath } from "./pathResolve";
import { systemDetector } from "./ExecutableLocator";
import type { AddonStatus, BlenderInstallation, SystemDetector } from "./types";

export class BlenderSetupService {
  constructor(private readonly detector: SystemDetector = systemDetector) {}

  async detectBlender(): Promise<BlenderInstallation | null> {
    return this.detector.detectBlender();
  }

  async detectAddon(settings: Record<string, unknown> = {}): Promise<AddonStatus> {
    const parsed = blenderSettings(settings);
    const host = parsed.addonHost ?? "127.0.0.1";
    const port = parsed.addonPort ?? 9876;
    const detected = await this.detector.probeTcp(host, port);
    return {
      detected,
      host,
      port,
      message: detected ? `Add-on listening on ${host}:${port}` : "Not detected",
    };
  }

  async installAddon() {
    await openExternalUrl("https://www.blender.org/lab/mcp-server/");
  }

  async verifyAddon(settings: Record<string, unknown> = {}) {
    return this.detectAddon(settings);
  }

  async chooseBlender() {
    return this.detector.pickFile("Locate Blender", [{ name: "Blender", extensions: ["exe", "app"] }]);
  }

  async chooseRepo() {
    const folder = await this.detector.pickDirectory("MCP Server Location");
    return folder ? resolveUserPath(folder).absolute : null;
  }

  async detectUv() {
    return this.detector.which("uv");
  }

  settingsFromDetect(blender: BlenderInstallation | null, extra: Partial<BlenderSettings> = {}): BlenderSettings {
    return blenderSettings({
      blenderPath: blender?.path,
      blenderVersion: blender?.version,
      ...extra,
    });
  }
}

export const blenderSetupService = new BlenderSetupService();
