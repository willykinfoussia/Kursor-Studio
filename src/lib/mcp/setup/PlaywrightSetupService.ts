import { playwrightSettings, type PlaywrightBrowser, type PlaywrightSettings } from "../builtin/playwright";
import { systemDetector } from "./ExecutableLocator";
import type { SystemDetector } from "./types";

export class PlaywrightSetupService {
  constructor(private readonly detector: SystemDetector = systemDetector) {}

  async detectNode() {
    const [node, npm, npx] = await Promise.all([
      this.detector.which("node"),
      this.detector.which("npm"),
      this.detector.which("npx"),
    ]);
    return { node, npm, npx };
  }

  withBrowser(settings: Record<string, unknown>, browser: PlaywrightBrowser): PlaywrightSettings {
    return playwrightSettings({ ...settings, browser });
  }

  withMode(settings: Record<string, unknown>, headless: boolean): PlaywrightSettings {
    return playwrightSettings({ ...settings, headless });
  }

  async chooseSecretsFile() {
    return this.detector.pickFile("Playwright secrets file", [{ name: "Env", extensions: ["env", "txt"] }]);
  }
}

export const playwrightSetupService = new PlaywrightSetupService();
