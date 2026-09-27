export type { KnowledgeCatalogItem } from "./prompt";
export { collectProductExcerpts } from "./excerpts";
export type { FileExcerpt } from "./excerpts";
export {
  buildKnowledgeReflectUserPrompt,
  buildSpecAuthorUserPrompt,
  KNOWLEDGE_REFLECT_SYSTEM,
  SPEC_AUTHOR_SYSTEM,
} from "./prompt";
export { parseKnowledgeReflectResult, hasKnowledgeActions, extractJsonObject, specFileNameFromLabel } from "./schema";
export { withFallbackProductSpec, fallbackProductSpec, adoptProductSpec } from "./fallbackSpec";
export { isSubstantialSpec, ensureSpecFrontmatter } from "./specDocument";
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
