import { beforeEach, describe, expect, it } from "vitest";
import { AI_MODELS } from "../../lib/agent/config";
import { sanitizeOptionalPositiveInt, useSettingsStore } from "../settingsStore";

describe("settingsStore persistence-ready updates", () => {
  beforeEach(() => {
    useSettingsStore.setState({
      defaultModel: AI_MODELS[0].id,
      modelOrder: AI_MODELS.map((model) => model.id),
      customModels: [],
      simulateFailureFor: [],
      fontSize: 13,
      ragIgnorePatterns: [],
      maxContextChars: 6000,
      automaticTools: true,
      permissionMode: "workspace-write",
      yoloMode: false,
      permissionWhitelist: [],
      hydrated: true,
    });
  });

  it("moves a model and keeps defaultModel as the first entry", () => {
    useSettingsStore.getState().moveModel(AI_MODELS[1].id, "up");
    const state = useSettingsStore.getState();
    expect(state.modelOrder[0]).toBe(AI_MODELS[1].id);
    expect(state.defaultModel).toBe(AI_MODELS[1].id);
  });

  it("places the selected default model first", () => {
    useSettingsStore.getState().update("defaultModel", AI_MODELS[2].id);
    const state = useSettingsStore.getState();
    expect(state.modelOrder).toEqual([
      AI_MODELS[2].id,
      AI_MODELS[0].id,
      AI_MODELS[1].id,
    ]);
    expect(state.defaultModel).toBe(AI_MODELS[2].id);
  });

  it("keeps new settings keys after hydrate no-op in tests", async () => {
    await useSettingsStore.getState().hydrate();
    expect(useSettingsStore.getState().hydrated).toBe(true);
    expect(useSettingsStore.getState().maxContextChars).toBeGreaterThan(0);
    expect(useSettingsStore.getState().permissionMode).toBe("workspace-write");
    expect(useSettingsStore.getState().yoloMode).toBe(false);
    expect(useSettingsStore.getState().permissionWhitelist).toEqual([]);
    expect(useSettingsStore.getState().maxAgentSteps).toBeNull();
    expect(useSettingsStore.getState().maxToolCalls).toBeNull();
  });

  it("syncs permissionMode with automaticTools", () => {
    useSettingsStore.getState().update("permissionMode", "read-only");
    expect(useSettingsStore.getState().automaticTools).toBe(false);
    useSettingsStore.getState().update("permissionMode", "full-access");
    expect(useSettingsStore.getState().automaticTools).toBe(true);
    expect(useSettingsStore.getState().permissionMode).toBe("full-access");
    useSettingsStore.getState().update("automaticTools", false);
    expect(useSettingsStore.getState().permissionMode).toBe("read-only");
    useSettingsStore.getState().update("automaticTools", true);
    expect(useSettingsStore.getState().permissionMode).toBe("workspace-write");
  });

  it("adds a custom Gateway model to the catalog and fallback order", () => {
    const result = useSettingsStore.getState().addCustomModel("moonshotai/kimi-k2.5");
    expect(result).toEqual({ ok: true });
    const state = useSettingsStore.getState();
    expect(state.customModels).toEqual([
      { id: "moonshotai/kimi-k2.5", name: "kimi-k2.5" },
    ]);
    expect(state.modelOrder).toContain("moonshotai/kimi-k2.5");
  });

  it("rejects an invalid or duplicate custom model id", () => {
    expect(useSettingsStore.getState().addCustomModel("not-a-gateway-id")).toEqual({
      ok: false,
      error: "Use a Gateway id like provider/model.",
    });
    expect(useSettingsStore.getState().addCustomModel(AI_MODELS[0].id)).toEqual({
      ok: false,
      error: "This model is already in the list.",
    });
    useSettingsStore.getState().addCustomModel("moonshotai/kimi-k2.5");
    expect(useSettingsStore.getState().addCustomModel("moonshotai/kimi-k2.5")).toEqual({
      ok: false,
      error: "This model is already in the list.",
    });
  });

  it("removes a custom model and restores a builtin default", () => {
    useSettingsStore.getState().addCustomModel("moonshotai/kimi-k2.5");
    useSettingsStore.getState().update("defaultModel", "moonshotai/kimi-k2.5");
    useSettingsStore.getState().removeCustomModel("moonshotai/kimi-k2.5");
    const state = useSettingsStore.getState();
    expect(state.customModels).toEqual([]);
    expect(state.modelOrder).not.toContain("moonshotai/kimi-k2.5");
    expect(state.defaultModel).toBe(AI_MODELS[0].id);
  });

  it("stores yoloMode and sanitizes the permission whitelist", () => {
    useSettingsStore.getState().update("yoloMode", true);
    expect(useSettingsStore.getState().yoloMode).toBe(true);
    useSettingsStore.getState().update("permissionWhitelist", [
      {
        action: "allow",
        tool: "run_command",
        capability: "terminal.execute",
        scope: { kind: "commands", families: ["pnpm"] },
      },
      { action: "deny", tool: "delete_file" },
    ]);
    expect(useSettingsStore.getState().permissionWhitelist).toEqual([
      {
        action: "allow",
        tool: "run_command",
        capability: "terminal.execute",
        scope: { kind: "commands", families: ["pnpm"] },
      },
    ]);
  });

  it("sanitizes optional agent caps to null, 0, or a positive int", () => {
    expect(sanitizeOptionalPositiveInt(null)).toBeNull();
    expect(sanitizeOptionalPositiveInt("")).toBeNull();
    expect(sanitizeOptionalPositiveInt(0)).toBeNull();
    expect(sanitizeOptionalPositiveInt(-4)).toBeNull();
    expect(sanitizeOptionalPositiveInt("nope")).toBeNull();
    expect(sanitizeOptionalPositiveInt(24)).toBe(24);
    expect(sanitizeOptionalPositiveInt("32")).toBe(32);
    expect(sanitizeOptionalPositiveInt(2.9)).toBe(2);
    useSettingsStore.getState().update("maxAgentSteps", 0);
    expect(useSettingsStore.getState().maxAgentSteps).toBeNull();
    useSettingsStore.getState().update("maxAgentSteps", 24);
    expect(useSettingsStore.getState().maxAgentSteps).toBe(24);
    useSettingsStore.getState().update("maxToolCalls", 32);
    expect(useSettingsStore.getState().maxToolCalls).toBe(32);
    useSettingsStore.getState().update("maxToolCalls", null);
    expect(useSettingsStore.getState().maxToolCalls).toBeNull();
  });
});
