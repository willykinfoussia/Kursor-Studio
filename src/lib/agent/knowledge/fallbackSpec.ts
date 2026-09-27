import { hasProductFileChanges, isProductImplementationPath } from "./gates";
import { specFileNameFromLabel } from "./schema";
import {
  ensureSpecFrontmatter,
  goalUsesFrench,
  hasSubstantialProductSpec,
  isSubstantialSpec,
} from "./specDocument";
import type { KnowledgeReflectInput, KnowledgeReflectResult, SpecProposalAction } from "./types";

function roleFor(path: string, french: boolean): string {
  const base = path.split("/").pop() ?? path;
  const stem = base.replace(/\.[^.]+$/, "").replace(/[-_]+/g, " ");
  const lower = base.toLowerCase();
  if (lower.endsWith(".css") || lower.endsWith(".scss")) {
    return french ? `Styles de ${stem}` : `Styles for ${stem}`;
  }
  if (/\.(tsx|jsx|vue|svelte)$/i.test(lower)) {
    return french ? `Composant d'interface ${stem}` : `UI component ${stem}`;
  }
  if (/\.(ts|js|mjs|cjs)$/i.test(lower)) {
    return french ? `Module ${stem}` : `Module ${stem}`;
  }
  return french ? `Fichier ${stem}` : `File ${stem}`;
}

function structureSection(files: readonly string[], french: boolean): string {
  if (files.length === 0) {
    return french ? "Aucun module produit n'a été modifié." : "No product module was changed.";
  }
  const groups = new Map<string, string[]>();
  for (const path of files) {
    const dir = path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : ".";
    const list = groups.get(dir) ?? [];
    list.push(path);
    groups.set(dir, list);
  }
  const lines: string[] = [];
  for (const [dir, paths] of groups) {
    lines.push(`### ${dir}`);
    for (const path of paths) {
      const base = path.split("/").pop() ?? path;
      lines.push(`- \`${base}\` — ${roleFor(path, french)}`);
    }
    lines.push("");
  }
  return lines.join("\n").trim();
}

export function fallbackProductSpec(
  input: Pick<KnowledgeReflectInput, "goal" | "filesChanged">,
): SpecProposalAction {
  const goal = input.goal.trim() || "Implementation";
  const french = goalUsesFrench(goal);
  const files = input.filesChanged.filter((path) => isProductImplementationPath(path)).slice(0, 16);
  const fileName = specFileNameFromLabel(goal);
  const labels = french
    ? { intention: "Intention", architecture: "Architecture", structure: "Structure", decisions: "Décisions", files: "Fichiers" }
    : { intention: "Intention", architecture: "Architecture", structure: "Structure", decisions: "Decisions", files: "Files" };
  const architecture = french
    ? "Ces modules réalisent l'intention ci-dessus. Le dossier de chaque fichier borne sa responsabilité : interface, style ou logique."
    : "These modules carry the intention above. Each file's folder bounds its responsibility: interface, style, or logic.";
  const decisions = french
    ? "Les contraintes durables sont celles que le code modifié rend visibles : rester dans ces modules et ces rôles."
    : "The lasting constraints are the ones the changed code makes visible: stay inside these modules and these roles.";
  const fileList = files.length
    ? files.map((path) => `- \`${path}\` — ${roleFor(path, french)}`).join("\n")
    : (french ? "Aucun fichier produit." : "No product file.");
  const body = [
    `# ${goal}`,
    "",
    `## ${labels.intention}`,
    "",
    goal,
    "",
    `## ${labels.architecture}`,
    "",
    architecture,
    "",
    `## ${labels.structure}`,
    "",
    structureSection(files, french),
    "",
    `## ${labels.decisions}`,
    "",
    decisions,
    "",
    `## ${labels.files}`,
    "",
    fileList,
  ].join("\n");
  return {
    id: "spec:fallback:architecture",
    action: "create",
    scope: "project",
    kind: "architecture",
    fileName,
    rationale: french
      ? "Des fichiers produit ont été implémentés ; enregistrer l'architecture."
      : "Product files were implemented; persist the architecture.",
    content: ensureSpecFrontmatter(body, {
      scope: "project",
      kind: "architecture",
      fileName,
      title: goal,
    }),
  };
}

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
      continue;
    }
  }
  if (!replaced) specActions.push(spec);
  return {
    summary: parsed.summary || `Recorded project spec for ${input.goal.trim() || "this implementation"}.`,
    skillActions: parsed.skillActions,
    specActions,
  };
}

export function withFallbackProductSpec(
  parsed: KnowledgeReflectResult,
  input: Pick<KnowledgeReflectInput, "goal" | "filesChanged" | "planUnfinished">,
): KnowledgeReflectResult {
  if (hasSubstantialProductSpec(parsed)) {
    const specActions = parsed.specActions.filter((action) =>
      (action.action !== "create" && action.action !== "update") || isSubstantialSpec(action.content ?? ""),
    );
    if (specActions.length === parsed.specActions.length) return parsed;
    return { ...parsed, specActions };
  }
  if (input.planUnfinished) return parsed;
  if (!hasProductFileChanges(input.filesChanged)) return parsed;
  return adoptProductSpec(parsed, fallbackProductSpec(input), input);
}
