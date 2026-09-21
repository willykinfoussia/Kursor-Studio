import type { AIModel } from "../types";
import { classifyModelTask, type ClassifyHints } from "./TaskClassifier";
import { ModelPolicy } from "./ModelPolicy";
import type { ModelPolicyConfig } from "./types";

export type {
  ModelCapability,
  ModelPolicyConfig,
  ModelProfile,
  ModelRoute,
  ModelTaskType,
} from "./types";
export {
  DEFAULT_CUSTOM_PROFILE,
  isModelCapability,
  isModelTaskType,
  MODEL_CAPABILITIES,
  MODEL_TASK_TYPES,
} from "./types";
export { BUILTIN_MODEL_PROFILES, builtinProfile, defaultProfileFor } from "./catalog";
export { classifyModelTask, TaskClassifier, type ClassifyHints } from "./TaskClassifier";
export {
  DEFAULT_MODEL_POLICY,
  mergeModelPolicy,
  ModelPolicy,
  resolveProfile,
  sanitizeModelPolicy,
} from "./ModelPolicy";

export function routeModels(input: {
  goal: string;
  ordered: readonly AIModel[];
  hints?: ClassifyHints;
  policy?: Partial<ModelPolicyConfig> | null;
  pin?: string;
}): { taskType: ReturnType<typeof classifyModelTask>; models: AIModel[] } {
  const policy = new ModelPolicy(input.policy);
  const taskType = classifyModelTask(input.goal, input.hints);
  const resolved = policy.resolve(taskType, input.ordered);
  return {
    taskType,
    models: policy.pinIfCompatible(resolved, taskType, input.pin),
  };
}
