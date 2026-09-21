export const MODEL_TASK_TYPES = [
  "coding",
  "planning",
  "research",
  "review",
  "summarization",
  "simple-edit",
] as const;

export type ModelTaskType = (typeof MODEL_TASK_TYPES)[number];

export const MODEL_CAPABILITIES = ["reasoning", "coding", "fast", "tools"] as const;

export type ModelCapability = (typeof MODEL_CAPABILITIES)[number];

export interface ModelProfile {
  capabilities: readonly ModelCapability[];
  usdPer1kInput: number;
  usdPer1kOutput: number;
}

export interface ModelRoute {
  capabilities: readonly ModelCapability[];
  preferredModelId?: string;
}

export interface ModelPolicyConfig {
  routes: Record<ModelTaskType, ModelRoute>;
  profiles: Record<string, Partial<ModelProfile>>;
}

export const DEFAULT_CUSTOM_PROFILE: ModelProfile = {
  capabilities: ["coding", "tools"],
  usdPer1kInput: 0,
  usdPer1kOutput: 0,
};

export function isModelTaskType(value: unknown): value is ModelTaskType {
  return typeof value === "string" && (MODEL_TASK_TYPES as readonly string[]).includes(value);
}

export function isModelCapability(value: unknown): value is ModelCapability {
  return typeof value === "string" && (MODEL_CAPABILITIES as readonly string[]).includes(value);
}
