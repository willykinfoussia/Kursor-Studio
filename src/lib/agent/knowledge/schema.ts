import type {
  KnowledgeReflectResult,
  SkillProposalAction,
  SkillProposalDraft,
  SpecProposalAction,
} from "./types";

export function extractJsonObject(raw: string): unknown {
  const trimmed = raw.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = (fenced?.[1] ?? trimmed).trim();
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(candidate.slice(start, end + 1));
  } catch {
    return null;
  }
}

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export function specFileNameFromLabel(text: string): string {
  const slug = text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return slug ? `${slug}.md` : "untitled.md";
}

function asStringList(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(asString).filter(Boolean);
  if (typeof value === "string") {
    return value.split(/[,;\n]/).map((item) => item.trim()).filter(Boolean);
  }
  return [];
}

function parseDraft(value: unknown): SkillProposalDraft | undefined {
  if (!value || typeof value !== "object") return undefined;
  const record = value as Record<string, unknown>;
  const instructions = asString(record.instructions);
  if (!instructions) return undefined;
  return {
    name: asString(record.name),
    description: asString(record.description),
    triggers: asStringList(record.triggers),
    instructions,
    allowedTools: asStringList(record.allowedTools ?? record.tools),
  };
}

function parseSkillAction(value: unknown, index: number): SkillProposalAction | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const action = asString(record.action).toLowerCase();
  if (action === "none" || !action) return null;
  if (action !== "create" && action !== "update") return null;
  const skillId = asString(record.skillId ?? record.id).toLowerCase().replace(/\s+/g, "-");
  if (!skillId) return null;
  const scope = asString(record.scope) === "user" ? "user" : "project";
  return {
    id: `skill:${index}:${skillId}`,
    action,
    skillId,
    scope,
    rationale: asString(record.rationale),
    draft: parseDraft(record.draft),
  };
}

function parseSpecAction(value: unknown, index: number): SpecProposalAction | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const action = asString(record.action).toLowerCase();
  if (action === "none" || !action) return null;
  if (action !== "create" && action !== "update" && action !== "delete" && action !== "reorganize") return null;
  const path = asString(record.path);
  let fileName = asString(record.fileName);
  if ((action === "update" || action === "delete" || action === "reorganize") && !path) return null;
  if (action === "create" && !path && !fileName && !asString(record.content)) {
    const label = asString(record.title) || asString(record.rationale) || asString(record.kind) || asString(record.group);
    if (!label) return null;
    fileName = specFileNameFromLabel(label);
  }
  const scope = asString(record.scope) === "account" ? "account" : "project";
  return {
    id: `spec:${index}:${path || fileName || action || index}`,
    action,
    scope,
    rationale: asString(record.rationale),
    path: path || undefined,
    kind: asString(record.kind) || undefined,
    group: asString(record.group) || undefined,
    fileName: fileName || undefined,
    targetPath: asString(record.targetPath) || undefined,
    content: asString(record.content) || undefined,
  };
}

export function parseKnowledgeReflectResult(raw: unknown): KnowledgeReflectResult {
  const source = typeof raw === "string" ? extractJsonObject(raw) : raw;
  if (!source || typeof source !== "object") {
    return { summary: "", skillActions: [], specActions: [] };
  }
  const record = source as Record<string, unknown>;
  const skills = Array.isArray(record.skillActions) ? record.skillActions : [];
  const specs = Array.isArray(record.specActions) ? record.specActions : [];
  return {
    summary: asString(record.summary),
    skillActions: skills.map(parseSkillAction).filter((item): item is SkillProposalAction => Boolean(item)),
    specActions: specs.map(parseSpecAction).filter((item): item is SpecProposalAction => Boolean(item)),
  };
}

export function hasKnowledgeActions(result: KnowledgeReflectResult) {
  return result.skillActions.length > 0 || result.specActions.length > 0;
}
