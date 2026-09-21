import type { AIModel } from "../types";
import { defaultProfileFor } from "./catalog";
import {
  isModelCapability,
  isModelTaskType,
  MODEL_TASK_TYPES,
  type ModelCapability,
  type ModelPolicyConfig,
  type ModelProfile,
  type ModelRoute,
  type ModelTaskType,
} from "./types";

export const DEFAULT_MODEL_POLICY: ModelPolicyConfig = {
  routes: {
    planning: { capabilities: ["reasoning"] },
    coding: { capabilities: ["coding", "tools"] },
    research: { capabilities: ["tools"] },
    review: { capabilities: ["reasoning"] },
    summarization: { capabilities: ["fast"] },
    "simple-edit": { capabilities: ["fast"] },
  },
  profiles: {},
};

export class ModelPolicy {
  readonly config: ModelPolicyConfig;

  constructor(override?: Partial<ModelPolicyConfig> | null) {
    this.config = mergeModelPolicy(override);
  }

  profile(modelId: string): ModelProfile {
    return resolveProfile(modelId, this.config.profiles);
  }

  requiredCapabilities(taskType: ModelTaskType): readonly ModelCapability[] {
    return this.config.routes[taskType].capabilities;
  }

  isCompatible(modelId: string, taskType: ModelTaskType): boolean {
    const required = this.requiredCapabilities(taskType);
    const capabilities = new Set(this.profile(modelId).capabilities);
    return required.every((capability) => capabilities.has(capability));
  }

  resolve(taskType: ModelTaskType, orderedFromRouter: readonly AIModel[]): AIModel[] {
    const preferredId = this.config.routes[taskType].preferredModelId;
    const compatible: AIModel[] = [];
    const rest: AIModel[] = [];
    for (const model of orderedFromRouter) {
      if (this.isCompatible(model.id, taskType)) compatible.push(model);
      else rest.push(model);
    }
    const preferred = preferredId
      ? compatible.find((model) => model.id === preferredId)
      : undefined;
    const withoutPreferred = preferred
      ? compatible.filter((model) => model.id !== preferred.id)
      : compatible;
    return preferred
      ? [preferred, ...withoutPreferred, ...rest]
      : [...compatible, ...rest];
  }

  pinIfCompatible(models: readonly AIModel[], taskType: ModelTaskType, pin?: string): AIModel[] {
    if (!pin) return [...models];
    const match = models.find((model) => model.id === pin);
    if (!match || !this.isCompatible(pin, taskType)) return [...models];
    return [match, ...models.filter((model) => model.id !== pin)];
  }
}

export function mergeModelPolicy(override?: Partial<ModelPolicyConfig> | null): ModelPolicyConfig {
  const routes = { ...DEFAULT_MODEL_POLICY.routes };
  if (override?.routes) {
    for (const taskType of MODEL_TASK_TYPES) {
      const incoming = override.routes[taskType];
      if (!incoming) continue;
      const capabilities = sanitizeCapabilities(incoming.capabilities);
      routes[taskType] = {
        capabilities: capabilities.length > 0 ? capabilities : DEFAULT_MODEL_POLICY.routes[taskType].capabilities,
        preferredModelId: sanitizePreferredId(incoming.preferredModelId)
          ?? DEFAULT_MODEL_POLICY.routes[taskType].preferredModelId,
      };
    }
  }
  return {
    routes,
    profiles: mergeProfiles(override?.profiles),
  };
}

export function sanitizeModelPolicy(value: unknown): ModelPolicyConfig {
  if (!value || typeof value !== "object") return mergeModelPolicy();
  const record = value as Partial<ModelPolicyConfig>;
  const routes = { ...DEFAULT_MODEL_POLICY.routes };
  if (record.routes && typeof record.routes === "object") {
    for (const [key, incoming] of Object.entries(record.routes)) {
      if (!isModelTaskType(key) || !incoming || typeof incoming !== "object") continue;
      const capabilities = sanitizeCapabilities((incoming as ModelRoute).capabilities);
      routes[key] = {
        capabilities: capabilities.length > 0 ? capabilities : DEFAULT_MODEL_POLICY.routes[key].capabilities,
        preferredModelId: sanitizePreferredId((incoming as ModelRoute).preferredModelId),
      };
    }
  }
  return {
    routes,
    profiles: mergeProfiles(record.profiles),
  };
}

export function resolveProfile(
  modelId: string,
  overrides: Record<string, Partial<ModelProfile>> = {},
): ModelProfile {
  const base = defaultProfileFor(modelId);
  const extra = overrides[modelId];
  if (!extra) return base;
  const capabilities = sanitizeCapabilities(extra.capabilities);
  return {
    capabilities: capabilities.length > 0 ? capabilities : base.capabilities,
    usdPer1kInput: sanitizeCost(extra.usdPer1kInput, base.usdPer1kInput),
    usdPer1kOutput: sanitizeCost(extra.usdPer1kOutput, base.usdPer1kOutput),
  };
}

function mergeProfiles(incoming?: Record<string, Partial<ModelProfile>>): Record<string, Partial<ModelProfile>> {
  const profiles: Record<string, Partial<ModelProfile>> = { ...DEFAULT_MODEL_POLICY.profiles };
  if (!incoming) return profiles;
  for (const [id, profile] of Object.entries(incoming)) {
    if (!id || !profile || typeof profile !== "object") continue;
    profiles[id] = {
      capabilities: sanitizeCapabilities(profile.capabilities),
      usdPer1kInput: typeof profile.usdPer1kInput === "number" ? profile.usdPer1kInput : undefined,
      usdPer1kOutput: typeof profile.usdPer1kOutput === "number" ? profile.usdPer1kOutput : undefined,
    };
  }
  return profiles;
}

function sanitizeCapabilities(value: unknown): ModelCapability[] {
  if (!Array.isArray(value)) return [];
  return value.filter(isModelCapability);
}

function sanitizePreferredId(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed || undefined;
}

function sanitizeCost(value: unknown, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : fallback;
}
