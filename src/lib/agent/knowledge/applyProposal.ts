import {
  isSpecKind,
  newAccountSpecPath,
  newProjectSpecPath,
  sanitizeSpecGroupName,
  type SpecKind,
} from "../../graph/classify";
import { createSpecGroup, ensureNestedDirectory, writeNewSpec } from "../../graph/createSpec";
import type { GraphFileStore } from "../../graph/types";
import { skillDocuments, SkillDocumentService } from "../skills/SkillDocument";
import type { KnowledgeProposal, SpecProposalAction, SkillProposalAction } from "./types";

export interface ApplyProposalSelection {
  skillIds?: string[];
  specIds?: string[];
}

export interface ApplyProposalDeps {
  skills?: SkillDocumentService;
  files: GraphFileStore;
  onSpecChanged?: (path: string, kind: "create" | "modify" | "remove") => Promise<void>;
}

function selected<T extends { id: string }>(items: T[], ids?: string[]) {
  if (!ids) return items;
  const allow = new Set(ids);
  return items.filter((item) => allow.has(item.id));
}

async function applySkill(action: SkillProposalAction, skills: SkillDocumentService) {
  const draft = {
    id: action.skillId,
    name: action.draft?.name || action.skillId,
    description: action.draft?.description || action.rationale,
    triggers: action.draft?.triggers ?? [],
    allowedTools: action.draft?.allowedTools ?? [],
    instructions: action.draft?.instructions || action.rationale,
  };
  const exists = await skills.exists(action.scope, action.skillId);
  if (action.action === "update" && exists) {
    await skills.update(action.scope, draft);
    return;
  }
  if (exists) await skills.update(action.scope, draft);
  else await skills.create(action.scope, draft);
}

async function resolveCreatePath(action: SpecProposalAction) {
  const fileName = action.fileName || "untitled.md";
  if (action.scope === "account") {
    return newAccountSpecPath(fileName, action.group ?? action.kind);
  }
  const kind = (action.kind && isSpecKind(action.kind) ? action.kind : "documentation") as SpecKind;
  return newProjectSpecPath(kind, fileName, action.group);
}

async function applySpec(
  action: SpecProposalAction,
  files: GraphFileStore,
  onSpecChanged?: ApplyProposalDeps["onSpecChanged"],
) {
  if (action.action === "create") {
    const kind = (action.kind && isSpecKind(action.kind) ? action.kind : undefined) as SpecKind | undefined;
    const path = await writeNewSpec(files, {
      scope: action.scope,
      kind,
      group: action.group,
      fileName: action.fileName || "untitled.md",
    });
    if (action.content) await files.writeFile(path, action.content);
    await onSpecChanged?.(path, "create");
    return path;
  }

  if (action.action === "update") {
    const path = action.path;
    if (!path) throw new Error("Spec update requires a path.");
    const body = action.content ?? await files.readFile(path);
    await files.writeFile(path, body);
    await onSpecChanged?.(path, "modify");
    return path;
  }

  if (action.action === "delete") {
    const path = action.path;
    if (!path) throw new Error("Spec delete requires a path.");
    await files.delete?.(path);
    await onSpecChanged?.(path, "remove");
    return path;
  }

  const from = action.path;
  const to = action.targetPath || await resolveCreatePath({ ...action, action: "create" });
  if (!from) throw new Error("Spec reorganize requires a path.");
  if (action.group) await createSpecGroup(files, action.scope, sanitizeSpecGroupName(action.group));
  const content = action.content ?? await files.readFile(from);
  const parent = to.split("/").slice(0, -1).join("/");
  await ensureNestedDirectory(files, parent);
  await files.writeFile(to, content);
  await files.delete?.(from);
  await onSpecChanged?.(from, "remove");
  await onSpecChanged?.(to, "create");
  return to;
}

export async function applyProposal(
  proposal: KnowledgeProposal,
  deps: ApplyProposalDeps,
  selection: ApplyProposalSelection = {},
): Promise<{ skills: string[]; specs: string[] }> {
  const skills = deps.skills ?? skillDocuments;
  const appliedSkills: string[] = [];
  const appliedSpecs: string[] = [];
  for (const action of selected(proposal.payload.skillActions, selection.skillIds)) {
    await applySkill(action, skills);
    appliedSkills.push(action.skillId);
  }
  for (const action of selected(proposal.payload.specActions, selection.specIds)) {
    const path = await applySpec(action, deps.files, deps.onSpecChanged);
    appliedSpecs.push(path);
  }
  return { skills: appliedSkills, specs: appliedSpecs };
}
