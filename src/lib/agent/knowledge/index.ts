export type { KnowledgeCatalogItem } from "./prompt";
export { buildKnowledgeReflectUserPrompt, KNOWLEDGE_REFLECT_SYSTEM } from "./prompt";
export { parseKnowledgeReflectResult, hasKnowledgeActions, extractJsonObject, specFileNameFromLabel } from "./schema";
export { withFallbackProductSpec, fallbackProductSpec } from "./fallbackSpec";
export {
  shouldSkipKnowledgeReflect,
  hasProductFileChanges,
  isProductImplementationPath,
  MIN_USEFUL_MESSAGES,
  SHORT_GOAL_MAX_TOKENS,
} from "./gates";
export { collectKnowledgeCatalog } from "./catalog";
export { applyProposal } from "./applyProposal";
export type { ApplyProposalDeps, ApplyProposalSelection } from "./applyProposal";
export { KnowledgeReflector, knowledgeReflector } from "./KnowledgeReflector";
export {
  knowledgeProposalStore,
  createMemoryKnowledgeProposalStore,
} from "./KnowledgeProposalStore";
export type { KnowledgeProposalStore } from "./KnowledgeProposalStore";
export type {
  KnowledgeProposal,
  KnowledgeReflectInput,
  KnowledgeReflectResult,
  SkillProposalAction,
  SpecProposalAction,
} from "./types";
