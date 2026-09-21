import type { CustomAIModel } from "../../types/settings";
import type { AIModel } from "./types";

export const MAX_RETRIES_PER_MODEL = 1;
export const MAX_AGENT_STEPS = 24;
export const MAX_TOOL_CALLS = 32;
export const EXPLORE_MAX_DURATION_MS = 15 * 60_000;
export const IMPLEMENT_MAX_DURATION_MS = 20 * 60_000;
export const REVIEW_MAX_DURATION_MS = 12 * 60_000;
export const SUBAGENT_TOOL_TIMEOUT_MS = Math.max(
  EXPLORE_MAX_DURATION_MS,
  IMPLEMENT_MAX_DURATION_MS,
  REVIEW_MAX_DURATION_MS,
);
export { MAX_VERIFICATION_ATTEMPTS, MAX_VERIFY_OUTPUT_CHARS } from "./verification/types";
/** @deprecated Use MAX_AGENT_STEPS. Kept as an alias for existing imports. */
export const MAX_TOOL_STEPS = MAX_AGENT_STEPS;

export const AI_MODELS = [
  {
    id: "poolside/laguna-s-2.1-free",
    name: "Laguna S 2.1",
    priority: 1,
    enabled: true,
  },
  {
    id: "inclusionai/ling-3.0-flash-sante-free",
    name: "Ling 3.0 Flash Sante",
    priority: 2,
    enabled: true,
  },
  {
    id: "deepseek/deepseek-v4-flash-0731",
    name: "DeepSeek V4 Flash",
    priority: 3,
    enabled: true,
  },
] as const satisfies readonly AIModel[];

export type AIModelId = (typeof AI_MODELS)[number]["id"];

export function isBuiltinModelId(modelId: string): boolean {
  return AI_MODELS.some((model) => model.id === modelId);
}

export function normalizeGatewayModelId(raw: string): string | null {
  const id = raw.trim();
  if (!id || id.length > 200) return null;
  if (/\s/.test(id)) return null;
  if (id.startsWith("/") || id.endsWith("/") || id.includes("//")) return null;
  if (!/^[a-zA-Z0-9._-]+\/[a-zA-Z0-9._/-]+$/.test(id)) return null;
  return id;
}

export function displayNameFromModelId(modelId: string): string {
  return modelId.split("/").pop() || modelId;
}

export function sanitizeCustomModels(value: unknown): CustomAIModel[] {
  if (!Array.isArray(value)) return [];
  const models: CustomAIModel[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const record = item as { id?: unknown; name?: unknown };
    const id = typeof record.id === "string" ? normalizeGatewayModelId(record.id) : null;
    if (!id || isBuiltinModelId(id) || models.some((model) => model.id === id)) continue;
    const name = typeof record.name === "string" && record.name.trim()
      ? record.name.trim()
      : displayNameFromModelId(id);
    models.push({ id, name });
  }
  return models;
}

export function listAvailableModels(customModels: readonly CustomAIModel[] = []): AIModel[] {
  const builtins: AIModel[] = AI_MODELS.map((model) => ({ ...model }));
  const extras: AIModel[] = [];
  let priority = builtins.length + 1;
  for (const custom of sanitizeCustomModels(customModels)) {
    extras.push({
      id: custom.id,
      name: custom.name,
      priority: priority++,
      enabled: true,
    });
  }
  return [...builtins, ...extras];
}

export function getModel(modelId: string, customModels: readonly CustomAIModel[] = []): AIModel | undefined {
  return listAvailableModels(customModels).find((model) => model.id === modelId);
}

export function getModelName(modelId: string, customModels: readonly CustomAIModel[] = []): string {
  return getModel(modelId, customModels)?.name ?? modelId;
}
