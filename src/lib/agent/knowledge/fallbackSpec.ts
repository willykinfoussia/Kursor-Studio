import { hasProductFileChanges, isProductImplementationPath } from "./gates";
import { specFileNameFromLabel } from "./schema";
import type { KnowledgeReflectInput, KnowledgeReflectResult, SpecProposalAction } from "./types";

export function fallbackProductSpec(
  input: Pick<KnowledgeReflectInput, "goal" | "filesChanged">,
): SpecProposalAction {
  const goal = input.goal.trim() || "Implementation";
  const files = input.filesChanged.filter((path) => isProductImplementationPath(path)).slice(0, 16);
  return {
    id: "spec:fallback:documentation",
    action: "create",
    scope: "project",
    kind: "documentation",
    fileName: specFileNameFromLabel(goal),
    rationale: "Product files were implemented; persist a project spec.",
    content: [
      `# ${goal}`,
      "",
      files.length ? `Files touched:\n${files.map((path) => `- ${path}`).join("\n")}` : "",
    ].filter(Boolean).join("\n"),
  };
}

export function withFallbackProductSpec(
  parsed: KnowledgeReflectResult,
  input: Pick<KnowledgeReflectInput, "goal" | "filesChanged" | "planUnfinished">,
): KnowledgeReflectResult {
  if (parsed.specActions.length > 0) return parsed;
  if (input.planUnfinished) return parsed;
  if (!hasProductFileChanges(input.filesChanged)) return parsed;
  const spec = fallbackProductSpec(input);
  return {
    summary: parsed.summary || `Recorded project spec for ${input.goal.trim() || "this implementation"}.`,
    skillActions: parsed.skillActions,
    specActions: [spec],
  };
}
