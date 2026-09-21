import { DEFAULT_CUSTOM_PROFILE, type ModelProfile } from "./types";

/** Explicit profiles. Never infer capabilities from the model id or display name. */
export const BUILTIN_MODEL_PROFILES: Record<string, ModelProfile> = {
  "poolside/laguna-s-2.1-free": {
    capabilities: ["coding", "tools", "fast"],
    usdPer1kInput: 0,
    usdPer1kOutput: 0,
  },
  "inclusionai/ling-3.0-flash-sante-free": {
    capabilities: ["coding", "tools", "fast"],
    usdPer1kInput: 0,
    usdPer1kOutput: 0,
  },
  "deepseek/deepseek-v4-flash-0731": {
    capabilities: ["reasoning", "coding", "tools"],
    usdPer1kInput: 0,
    usdPer1kOutput: 0,
  },
};

export function builtinProfile(modelId: string): ModelProfile | undefined {
  return BUILTIN_MODEL_PROFILES[modelId];
}

export function defaultProfileFor(modelId: string): ModelProfile {
  return builtinProfile(modelId) ?? {
    capabilities: [...DEFAULT_CUSTOM_PROFILE.capabilities],
    usdPer1kInput: DEFAULT_CUSTOM_PROFILE.usdPer1kInput,
    usdPer1kOutput: DEFAULT_CUSTOM_PROFILE.usdPer1kOutput,
  };
}
