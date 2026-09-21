import type { GraphConfig, GraphConfigWeights, RelationType } from "./types";
import { RELATION_TYPES } from "./types";

export const GRAPH_CACHE_DIR = ".kursor/graph";
export const GRAPH_NODES_PATH = `${GRAPH_CACHE_DIR}/nodes.json`;
export const GRAPH_EDGES_PATH = `${GRAPH_CACHE_DIR}/edges.json`;
export const GRAPH_CONFIG_PATH = ".kursor/graph.json";

export const DEFAULT_GRAPH_WEIGHTS: GraphConfigWeights = {
  explicitReference: 1,
  importReference: 1,
  basenameMatch: 0.4,
  directoryMatch: 0.2,
  domainMatch: 0.15,
  symbolMatch: 0.15,
  keywordMatch: 0.1,
  testNameMatch: 0.3,
  nameMention: 0.12,
};

export const DEFAULT_GRAPH_CONFIG: GraphConfig = {
  minConfidence: 0.6,
  candidateTokenJaccard: 0.18,
  weights: { ...DEFAULT_GRAPH_WEIGHTS },
  relations: [...RELATION_TYPES],
};

const WEIGHT_KEYS = Object.keys(DEFAULT_GRAPH_WEIGHTS) as (keyof GraphConfigWeights)[];

export function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

export function mergeGraphConfig(raw: unknown): GraphConfig {
  const source = unwrapGraphConfig(raw);
  const weights = { ...DEFAULT_GRAPH_WEIGHTS };
  if (source.weights && typeof source.weights === "object") {
    for (const key of WEIGHT_KEYS) {
      const value = (source.weights as Record<string, unknown>)[key];
      if (typeof value === "number") weights[key] = clamp01(value);
    }
  }
  const relations = Array.isArray(source.relations)
    ? source.relations.filter((item): item is RelationType =>
      typeof item === "string" && (RELATION_TYPES as readonly string[]).includes(item))
    : [...RELATION_TYPES];
  return {
    minConfidence: typeof source.minConfidence === "number" ? clamp01(source.minConfidence) : DEFAULT_GRAPH_CONFIG.minConfidence,
    candidateTokenJaccard: typeof source.candidateTokenJaccard === "number"
      ? clamp01(source.candidateTokenJaccard)
      : DEFAULT_GRAPH_CONFIG.candidateTokenJaccard,
    weights,
    relations: relations.length > 0 ? relations : [...RELATION_TYPES],
  };
}

function unwrapGraphConfig(raw: unknown): Record<string, unknown> {
  if (!raw || typeof raw !== "object") return {};
  const record = raw as Record<string, unknown>;
  if (record.graph && typeof record.graph === "object") return record.graph as Record<string, unknown>;
  return record;
}

export function parseGraphConfigJson(text: string): GraphConfig {
  try {
    return mergeGraphConfig(JSON.parse(text) as unknown);
  } catch {
    return { ...DEFAULT_GRAPH_CONFIG, weights: { ...DEFAULT_GRAPH_WEIGHTS }, relations: [...RELATION_TYPES] };
  }
}

export const STOP_WORDS = new Set([
  "the", "and", "for", "with", "that", "this", "from", "into", "onto", "over",
  "your", "have", "has", "was", "were", "are", "not", "but", "you", "our",
  "their", "they", "them", "then", "than", "also", "just", "like", "use",
  "used", "using", "via", "per", "any", "all", "can", "will", "should",
  "true", "false", "null", "undefined", "return", "const", "let", "var",
  "function", "class", "export", "import", "default", "type", "interface",
  "public", "private", "async", "await", "void", "string", "number",
]);
