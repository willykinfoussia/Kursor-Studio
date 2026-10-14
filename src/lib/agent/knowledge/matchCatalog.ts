import { graphTokens } from "../../graph/tokenize";
import type { KnowledgeCatalogItem } from "./prompt";
import type { SkillProposalAction, SpecProposalAction } from "./types";

export const MAX_MATCHED_SPECS = 4;
export const MAX_MATCHED_SKILLS = 3;
export const SPEC_EXCERPT_CHARS = 700;
export const SKILL_EXCERPT_CHARS = 400;
const MIN_TOKEN_LENGTH = 4;
const MIN_TOKEN_OVERLAP = 2;

export interface CatalogQuery {
  goal: string;
  filesChanged: readonly string[];
}

function clip(value: string, max: number): string {
  const trimmed = value.trim();
  if (trimmed.length <= max) return trimmed;
  return `${trimmed.slice(0, max - 1)}…`;
}

function significant(tokens: readonly string[]): string[] {
  return tokens.filter((token) => token.length >= MIN_TOKEN_LENGTH);
}

function basenameOf(path: string): string {
  const base = path.split(/[/\\]/).pop() ?? path;
  return base.replace(/\.[^.]+$/, "").toLowerCase();
}

function itemTokens(item: KnowledgeCatalogItem): string[] {
  if (item.tokens && item.tokens.length > 0) return significant(item.tokens);
  return significant(graphTokens(`${item.id} ${item.title ?? ""} ${item.description ?? ""} ${item.path ?? ""}`));
}

export function queryTokens(input: CatalogQuery): string[] {
  const names = input.filesChanged.map((path) => basenameOf(path)).join(" ");
  return significant(graphTokens(`${input.goal} ${names}`));
}

export function catalogMatchScore(item: KnowledgeCatalogItem, input: CatalogQuery): number {
  const query = queryTokens(input);
  const haystack = new Set(itemTokens(item));
  const overlap = query.filter((token) => haystack.has(token));
  const blob = `${item.path ?? ""} ${item.title ?? ""} ${item.id}`.toLowerCase();
  const basenameHit = input.filesChanged.some((path) => {
    const base = basenameOf(path);
    return base.length >= MIN_TOKEN_LENGTH && blob.includes(base);
  });
  if (overlap.length < MIN_TOKEN_OVERLAP && !basenameHit) return 0;
  return overlap.length + (basenameHit ? 2 : 0);
}

export function selectMatchedCatalog(
  items: readonly KnowledgeCatalogItem[],
  input: CatalogQuery,
): { specs: KnowledgeCatalogItem[]; skills: KnowledgeCatalogItem[] } {
  const scored = items
    .map((item) => ({ item, score: catalogMatchScore(item, input) }))
    .filter((entry) => entry.score > 0)
    .sort((left, right) => right.score - left.score || left.item.id.localeCompare(right.item.id));
  return {
    specs: scored.filter((entry) => entry.item.kind === "spec").slice(0, MAX_MATCHED_SPECS).map((entry) => entry.item),
    skills: scored.filter((entry) => entry.item.kind === "skill").slice(0, MAX_MATCHED_SKILLS).map((entry) => entry.item),
  };
}

export async function enrichCatalogExcerpts(
  items: readonly KnowledgeCatalogItem[],
  input: CatalogQuery,
  readFile?: (path: string) => Promise<string>,
  readSkill?: (id: string) => Promise<string | undefined>,
): Promise<KnowledgeCatalogItem[]> {
  const { specs, skills } = selectMatchedCatalog(items, input);
  const specExcerpts = new Map<string, string>();
  const skillExcerpts = new Map<string, string>();
  if (readFile) {
    for (const spec of specs) {
      if (!spec.path) continue;
      try {
        const raw = await readFile(spec.path);
        if (raw.trim()) specExcerpts.set(spec.path, clip(raw, SPEC_EXCERPT_CHARS));
      } catch {
        // The path stays in the catalog without a body.
      }
    }
  }
  if (readSkill) {
    for (const skill of skills) {
      try {
        const raw = await readSkill(skill.id);
        if (raw?.trim()) skillExcerpts.set(skill.id, clip(raw, SKILL_EXCERPT_CHARS));
      } catch {
        // The skill stays listed by its description.
      }
    }
  }
  const enriched = items.map((item) => {
    if (item.kind === "spec" && item.path && specExcerpts.has(item.path)) {
      return { ...item, excerpt: specExcerpts.get(item.path) };
    }
    if (item.kind === "skill" && skillExcerpts.has(item.id)) {
      return { ...item, excerpt: skillExcerpts.get(item.id) };
    }
    return item;
  });
  const featured = enriched.filter((item) => item.excerpt);
  const rest = enriched.filter((item) => !item.excerpt);
  return [...featured, ...rest];
}

function overlapsExistingSkill(action: SkillProposalAction, skills: readonly KnowledgeCatalogItem[]): boolean {
  const tokens = significant(graphTokens(action.draft?.description ?? ""));
  if (tokens.length < MIN_TOKEN_OVERLAP) return false;
  return skills.some((skill) => {
    if (skill.id === action.skillId) return false;
    const haystack = new Set(itemTokens(skill));
    const shared = tokens.filter((token) => haystack.has(token));
    return shared.length >= MIN_TOKEN_OVERLAP && shared.length / tokens.length >= 0.5;
  });
}

export function bindSkillCreates(
  actions: readonly SkillProposalAction[],
  catalog: readonly KnowledgeCatalogItem[],
): SkillProposalAction[] {
  const skills = catalog.filter((item) => item.kind === "skill");
  const ids = new Set(skills.map((item) => item.id));
  const next: SkillProposalAction[] = [];
  for (const action of actions) {
    if (action.action !== "create") {
      next.push(action);
      continue;
    }
    if (ids.has(action.skillId)) {
      next.push({ ...action, action: "update" });
      continue;
    }
    if (overlapsExistingSkill(action, skills)) continue;
    next.push(action);
  }
  return next;
}

function bestSpecFor(
  action: SpecProposalAction,
  matches: readonly KnowledgeCatalogItem[],
): KnowledgeCatalogItem | undefined {
  const available = matches.filter((item) => item.path);
  if (available.length === 0) return undefined;
  const hintTokens = new Set(significant(graphTokens(
    `${action.fileName ?? ""} ${action.kind ?? ""} ${action.path ?? ""} ${action.content ?? ""}`,
  )));
  const hinted = available.find((item) => {
    const file = (item.path ?? "").split("/").pop()?.replace(/\.md$/i, "").toLowerCase() ?? "";
    return file.length >= MIN_TOKEN_LENGTH && hintTokens.has(file);
  });
  return hinted ?? available[0];
}

export function bindSpecCreates(
  actions: readonly SpecProposalAction[],
  matches: readonly KnowledgeCatalogItem[],
): SpecProposalAction[] {
  if (matches.length === 0) return [...actions];
  const used = new Set<string>();
  const next: SpecProposalAction[] = [];
  for (const action of actions) {
    if (action.action !== "create") {
      next.push(action);
      if (action.path) used.add(action.path);
      continue;
    }
    const target = bestSpecFor(action, matches);
    if (!target?.path) {
      next.push(action);
      continue;
    }
    if (used.has(target.path)) continue;
    used.add(target.path);
    next.push({
      ...action,
      action: "update",
      path: target.path,
      scope: target.scope === "account" ? "account" : action.scope,
      fileName: action.fileName || target.path.split("/").pop(),
    });
  }
  return next;
}
