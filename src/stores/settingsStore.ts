import { create } from "zustand";
import {
  AI_MODELS,
  displayNameFromModelId,
  isBuiltinModelId,
  listAvailableModels,
  normalizeGatewayModelId,
  sanitizeCustomModels,
} from "../lib/agent/config";
import { isPermissionMode, sanitizePermissionWhitelist, sessionModeFromSettings } from "../lib/agent/permissions/types";
import { isTauri } from "../lib/tauri/invoke";
import { settingsRepository } from "../lib/storage/settingsRepository";
import { useAccountStore } from "./accountStore";
import { defaultShellName } from "../lib/terminal/shellUtils";
import { mergeModelPolicy, sanitizeModelPolicy } from "../lib/agent/routing";
import type { AppSettings, CustomAIModel } from "../types/settings";

export type CustomModelResult = { ok: true } | { ok: false; error: string };

interface SettingsState extends AppSettings {
  hydrated: boolean;
  hydrate: () => Promise<void>;
  update: <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => void;
  moveModel: (modelId: string, direction: "up" | "down") => void;
  addCustomModel: (rawId: string) => CustomModelResult;
  removeCustomModel: (modelId: string) => void;
}

const SETTING_KEYS: (keyof AppSettings)[] = [
  "theme",
  "fontSize",
  "defaultModel",
  "fallbackEnabled",
  "modelOrder",
  "customModels",
  "simulateFailureFor",
  "automaticTools",
  "permissionMode",
  "confirmDestructive",
  "yoloMode",
  "permissionWhitelist",
  "terminalShell",
  "autoSave",
  "autoSaveMode",
  "showExcludedDirectories",
  "ragIgnorePatterns",
  "maxContextChars",
  "modelPolicy",
  "compactTools",
  "autoCollapseCompletedTools",
  "showToolDetails",
  "showThinkingDetails",
  "stickyCurrentTask",
  "openLastProjectOnStartup",
  "disabledCapabilityIds",
  "reviewDiffLayout",
  "reviewAdvanceOnDecision",
  "reviewOpenShortcut",
  "knowledgeReflectEnabled",
  "maxAgentSteps",
  "maxToolCalls",
];

function withModelOrder(
  modelOrder: string[],
  customModels: readonly CustomAIModel[] = [],
): Pick<AppSettings, "modelOrder" | "defaultModel"> {
  const known = listAvailableModels(customModels).map((model) => model.id);
  const unique: string[] = [];
  for (const modelId of modelOrder) {
    if (!known.includes(modelId) || unique.includes(modelId)) continue;
    unique.push(modelId);
  }
  for (const modelId of known) {
    if (!unique.includes(modelId)) unique.push(modelId);
  }
  return {
    modelOrder: unique,
    defaultModel: unique[0] ?? AI_MODELS[0].id,
  };
}

const defaults: AppSettings = {
  theme: "Kursor Dark",
  fontSize: 13,
  defaultModel: AI_MODELS[0].id,
  fallbackEnabled: true,
  modelOrder: AI_MODELS.map((model) => model.id),
  customModels: [],
  simulateFailureFor: [],
  automaticTools: true,
  permissionMode: "workspace-write",
  confirmDestructive: true,
  yoloMode: false,
  permissionWhitelist: [],
  terminalShell: defaultShellName(),
  autoSave: false,
  autoSaveMode: "off",
  showExcludedDirectories: false,
  ragIgnorePatterns: [],
  maxContextChars: 6_000,
  modelPolicy: mergeModelPolicy(),
  compactTools: true,
  autoCollapseCompletedTools: true,
  showToolDetails: false,
  showThinkingDetails: false,
  stickyCurrentTask: true,
  openLastProjectOnStartup: true,
  disabledCapabilityIds: [],
  reviewDiffLayout: "split",
  reviewAdvanceOnDecision: true,
  reviewOpenShortcut: "Ctrl+Shift+R",
  knowledgeReflectEnabled: true,
  maxAgentSteps: null,
  maxToolCalls: null,
};

let persistTimer: number | undefined;
let hydrating = false;

function persistSoon() {
  if (!isTauri() || hydrating) return;
  window.clearTimeout(persistTimer);
  persistTimer = window.setTimeout(() => {
    const state = useSettingsStore.getState();
    const accountId = useAccountStore.getState().currentAccount?.id;
    void Promise.all(SETTING_KEYS.map((key) => (
      accountId
        ? settingsRepository.setForAccount(accountId, key, state[key])
        : settingsRepository.set(key, state[key])
    ))).catch(() => undefined);
  }, 300);
}

function parseStored(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

export function sanitizeOptionalPositiveInt(value: unknown): number | null {
  if (value == null || value === "") return null;
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) return null;
  const floored = Math.floor(parsed);
  return floored >= 1 ? floored : null;
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  ...defaults,
  hydrated: false,
  hydrate: async () => {
    if (!isTauri()) {
      set({ hydrated: true });
      return;
    }
    hydrating = true;
    try {
      const records = useAccountStore.getState().currentAccount
        ? await settingsRepository.listForAccount(useAccountStore.getState().currentAccount!.id)
        : await settingsRepository.list();
      const next: Partial<AppSettings> = {};
      for (const record of records) {
        if (!SETTING_KEYS.includes(record.key as keyof AppSettings)) continue;
        (next as Record<string, unknown>)[record.key] = parseStored(record.value);
      }
      const customModels = sanitizeCustomModels(next.customModels ?? get().customModels);
      next.customModels = customModels;
      if (next.modelOrder || next.defaultModel) {
        Object.assign(next, withModelOrder((next.modelOrder as string[] | undefined) ?? get().modelOrder, customModels));
        if (next.defaultModel) {
          Object.assign(next, withModelOrder([next.defaultModel as string, ...((next.modelOrder as string[]) ?? [])], customModels));
        }
      }
      const automaticTools = typeof next.automaticTools === "boolean" ? next.automaticTools : get().automaticTools;
      next.permissionMode = isPermissionMode(next.permissionMode)
        ? next.permissionMode
        : sessionModeFromSettings(automaticTools);
      next.automaticTools = next.permissionMode !== "read-only";
      next.yoloMode = typeof next.yoloMode === "boolean" ? next.yoloMode : get().yoloMode;
      next.permissionWhitelist = sanitizePermissionWhitelist(next.permissionWhitelist ?? get().permissionWhitelist);
      next.modelPolicy = sanitizeModelPolicy(next.modelPolicy ?? get().modelPolicy);
      next.disabledCapabilityIds = Array.isArray(next.disabledCapabilityIds)
        ? next.disabledCapabilityIds.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
        : [];
      next.reviewDiffLayout = next.reviewDiffLayout === "unified" ? "unified" : "split";
      next.reviewAdvanceOnDecision = typeof next.reviewAdvanceOnDecision === "boolean"
        ? next.reviewAdvanceOnDecision
        : get().reviewAdvanceOnDecision;
      next.reviewOpenShortcut = typeof next.reviewOpenShortcut === "string" && next.reviewOpenShortcut.trim()
        ? next.reviewOpenShortcut.trim()
        : "Ctrl+Shift+R";
      next.knowledgeReflectEnabled = typeof next.knowledgeReflectEnabled === "boolean"
        ? next.knowledgeReflectEnabled
        : get().knowledgeReflectEnabled;
      next.maxAgentSteps = sanitizeOptionalPositiveInt(next.maxAgentSteps);
      next.maxToolCalls = sanitizeOptionalPositiveInt(next.maxToolCalls);
      set({ ...next, hydrated: true });
    } catch {
      set({ hydrated: true });
    } finally {
      hydrating = false;
    }
  },
  update: (key, value) => {
    if (key === "defaultModel") {
      const remaining = get().modelOrder.filter((modelId) => modelId !== value);
      set(withModelOrder([value as string, ...remaining], get().customModels));
      persistSoon();
      return;
    }
    if (key === "modelOrder") {
      set(withModelOrder(value as string[], get().customModels));
      persistSoon();
      return;
    }
    if (key === "customModels") {
      const customModels = sanitizeCustomModels(value);
      set({ customModels, ...withModelOrder(get().modelOrder, customModels) });
      persistSoon();
      return;
    }
    if (key === "permissionMode") {
      const permissionMode = isPermissionMode(value) ? value : "workspace-write";
      set({ permissionMode, automaticTools: permissionMode !== "read-only" });
      persistSoon();
      return;
    }
    if (key === "automaticTools") {
      const automaticTools = Boolean(value);
      const permissionMode = automaticTools
        ? (get().permissionMode === "full-access" ? "full-access" : "workspace-write")
        : "read-only";
      set({ automaticTools, permissionMode });
      persistSoon();
      return;
    }
    if (key === "modelPolicy") {
      set({ modelPolicy: sanitizeModelPolicy(value) });
      persistSoon();
      return;
    }
    if (key === "permissionWhitelist") {
      set({ permissionWhitelist: sanitizePermissionWhitelist(value) });
      persistSoon();
      return;
    }
    if (key === "yoloMode") {
      set({ yoloMode: Boolean(value) });
      persistSoon();
      return;
    }
    if (key === "maxAgentSteps" || key === "maxToolCalls") {
      set({ [key]: sanitizeOptionalPositiveInt(value) } as Partial<SettingsState>);
      persistSoon();
      return;
    }
    set({ [key]: value } as Partial<SettingsState>);
    persistSoon();
  },
  moveModel: (modelId, direction) => {
    const order = [...get().modelOrder];
    const index = order.indexOf(modelId);
    if (index < 0) return;
    const nextIndex = index + (direction === "up" ? -1 : 1);
    if (nextIndex < 0 || nextIndex >= order.length) return;
    const current = order[index];
    const neighbor = order[nextIndex];
    if (!current || !neighbor) return;
    order[index] = neighbor;
    order[nextIndex] = current;
    set(withModelOrder(order, get().customModels));
    persistSoon();
  },
  addCustomModel: (rawId) => {
    const id = normalizeGatewayModelId(rawId);
    if (!id) return { ok: false, error: "Use a Gateway id like provider/model." };
    const { customModels, modelOrder } = get();
    if (isBuiltinModelId(id) || customModels.some((model) => model.id === id) || modelOrder.includes(id)) {
      return { ok: false, error: "This model is already in the list." };
    }
    const nextCustom = [...customModels, { id, name: displayNameFromModelId(id) }];
    set({ customModels: nextCustom, ...withModelOrder([...modelOrder, id], nextCustom) });
    persistSoon();
    return { ok: true };
  },
  removeCustomModel: (modelId) => {
    if (isBuiltinModelId(modelId)) return;
    const customModels = get().customModels.filter((model) => model.id !== modelId);
    const simulateFailureFor = get().simulateFailureFor.filter((id) => id !== modelId);
    const order = get().modelOrder.filter((id) => id !== modelId);
    set({ customModels, simulateFailureFor, ...withModelOrder(order, customModels) });
    persistSoon();
  },
}));
