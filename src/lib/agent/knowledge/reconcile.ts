import { bindSkillCreates, bindSpecCreates, selectMatchedCatalog, type CatalogQuery } from "./matchCatalog";
import { isSubstantialSpec } from "./specDocument";
import { isReusableSkill } from "./skillQuality";
import type { KnowledgeReflectInput, KnowledgeReflectResult, SpecProposalAction } from "./types";
import type { KnowledgeCatalogItem } from "./prompt";
import type { KnowledgeReflectMode } from "./gates";

export function adoptProductSpec(
  parsed: KnowledgeReflectResult,
  spec: SpecProposalAction,
  input: Pick<KnowledgeReflectInput, "goal">,
): KnowledgeReflectResult {
  let replaced = false;
  const specActions: SpecProposalAction[] = [];
  for (const action of parsed.specActions) {
    const isBody = action.action === "create" || action.action === "update";
    if (!isBody) {
      specActions.push(action);
      continue;
    }
    if (isSubstantialSpec(action.content ?? "")) {
      specActions.push(action);
      continue;
    }
    if (!replaced) {
      specActions.push({
        ...action,
        content: spec.content,
        kind: action.kind && action.kind !== "documentation" ? action.kind : spec.kind,
        fileName: action.fileName || spec.fileName,
        rationale: action.rationale || spec.rationale,
      });
      replaced = true;
    }
  }
  if (!replaced) specActions.push(spec);
  return {
    summary: parsed.summary || `Recorded project spec for ${input.goal.trim() || "this implementation"}.`,
    skillActions: parsed.skillActions,
    specActions,
  };
}

export function reconcileKnowledge(
  parsed: KnowledgeReflectResult,
  catalog: readonly KnowledgeCatalogItem[],
  input: CatalogQuery,
  mode: KnowledgeReflectMode,
): KnowledgeReflectResult {
  const skillActions = bindSkillCreates(parsed.skillActions.filter(isReusableSkill), catalog);
  if (mode === "skills") {
    return { summary: parsed.summary, skillActions, specActions: [] };
  }
  const kept = parsed.specActions.filter((action) =>
    (action.action !== "create" && action.action !== "update") || isSubstantialSpec(action.content ?? ""),
  );
  const { specs } = selectMatchedCatalog(catalog, input);
  return {
    summary: parsed.summary,
    skillActions,
    specActions: bindSpecCreates(kept, specs),
  };
}
