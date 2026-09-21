import { mcpSecretKey, secretStore } from "../../agent/SecretStore";
import { COMPOSIO_API_KEY_REF, composioSettings } from "../builtin/composio";

export class ComposioSetupService {
  async hasKey() {
    return Boolean(await secretStore.get(mcpSecretKey("composio", "COMPOSIO_API_KEY")));
  }

  async storeKey(value: string) {
    const trimmed = value.trim();
    if (!trimmed) throw new Error("API key is required.");
    await secretStore.set(mcpSecretKey("composio", "COMPOSIO_API_KEY"), trimmed);
    return COMPOSIO_API_KEY_REF;
  }

  toggleToolkit(settings: Record<string, unknown>, toolkit: string, enabled: boolean) {
    const current = composioSettings(settings);
    const enabledToolkits = enabled
      ? [...new Set([...current.enabledToolkits, toolkit])]
      : current.enabledToolkits.filter((item) => item !== toolkit);
    return { ...current, enabledToolkits };
  }

  toggleTool(settings: Record<string, unknown>, tool: string, enabled: boolean) {
    const current = composioSettings(settings);
    const enabledTools = enabled
      ? [...new Set([...current.enabledTools, tool])]
      : current.enabledTools.filter((item) => item !== tool);
    return { ...current, enabledTools };
  }
}

export const composioSetupService = new ComposioSetupService();
