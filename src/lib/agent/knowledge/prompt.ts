import type { FileExcerpt } from "./excerpts";
import type { KnowledgeReflectInput } from "./types";

export interface KnowledgeCatalogItem {
  id: string;
  kind: "skill" | "spec";
  origin?: string;
  scope?: string;
  title?: string;
  description?: string;
  path?: string;
  excerpt?: string;
  tokens?: string[];
}

const MAX_MESSAGES = 24;
const MAX_MESSAGE_CHARS = 700;
const MAX_CATALOG = 80;

export const KNOWLEDGE_REFLECT_SYSTEM = `You extract durable knowledge from a finished coding-agent run.

Return JSON only:
{
  "summary": "one line",
  "skillActions": [{ "action": "create"|"update"|"none", "skillId": "", "scope": "project"|"user", "rationale": "", "draft": { "name": "", "description": "Use when …", "triggers": [], "instructions": "", "allowedTools": [] } }],
  "specActions": [{ "action": "create"|"update"|"delete"|"reorganize"|"none", "scope": "account"|"project", "path": "", "kind": "", "group": "", "fileName": "", "targetPath": "", "rationale": "", "content": "" }]
}

Rules:
- Skill = a procedure that would still be correct in another repository. Spec = the architecture, structure, and decisions of this repository.
- A file change is not a skill. A decision that only makes sense in this repository is not a skill.
- Write a spec only when the run adds architectural knowledge that is absent from the catalog. If a catalog spec already covers the area, update that spec instead of creating another.
- Spec content is markdown in the language of the goal. Required sections, each with real prose: Intention (why this exists), Architecture (how the pieces fit), Structure (each module's role), Décisions (lasting choices and constraints), Fichiers (each file with one sentence on its role).
- A heading followed by a file list is not a spec. Describe the system, not the task log.
- Skill description starts with "Use when". Instructions are ordered steps. Omit a skill the catalog already states.
- Ignore ephemeral task state, one-off bug traces, and disposable code snippets.
- delete / reorganize only with strong evidence a spec is obsolete or in the wrong group.
- Prefer empty arrays when nothing durable was learned.
- Never invent secrets. Keep skill drafts short. Spec content must be specific to the code excerpts.`;

export const SPEC_AUTHOR_SYSTEM = `You write one durable project specification from a finished coding run.

Return JSON only:
{ "summary": "one line", "kind": "architecture", "fileName": "short-name.md", "title": "", "content": "markdown" }

The content is a project spec in the language of the goal. It describes the architecture, structure, and decisions behind the code, not a task log.
When a catalog spec excerpt already covers this area, write the content so it can replace that spec.
Required sections, translated into the goal's language when needed:
## Intention
## Architecture
## Structure
## Décisions
## Fichiers

Intention: why this code exists and the philosophy behind it.
Architecture: how the pieces fit, the flows, the responsibilities, and the boundaries.
Structure: each module's role, not only its path.
Décisions: design choices and lasting constraints.
Fichiers: each changed file with one sentence on its role.

kind is a precise project spec kind (ui, api, auth, ...) or architecture.
Do not return a heading plus a file list. Never invent secrets.`;

export function clipText(value: string, max: number) {
  if (value.length <= max) return value;
  return `${value.slice(0, max - 1)}…`;
}

function catalogLine(item: KnowledgeCatalogItem): string {
  if (item.kind === "skill") {
    const line = `- skill ${item.id} (${item.origin ?? "project"}): ${clipText(item.description ?? "", 160)}`;
    return item.excerpt ? `${line}\n${clipText(item.excerpt, 400)}` : line;
  }
  const line = `- spec ${item.path ?? item.id} [${item.scope ?? "project"}/${item.title || item.id}]: ${clipText(item.description ?? "", 120)}`;
  return item.excerpt ? `${line}\n${clipText(item.excerpt, 700)}` : line;
}

export function formatKnowledgeCatalog(items: readonly KnowledgeCatalogItem[]) {
  const featured = items.filter((item) => item.excerpt);
  const rest = items.filter((item) => !item.excerpt);
  return [...featured, ...rest].slice(0, MAX_CATALOG).map(catalogLine).join("\n");
}

export function formatKnowledgeConversation(input: KnowledgeReflectInput) {
  const recent = input.messages.slice(-MAX_MESSAGES);
  const lines = recent.map((message) => `${message.role}: ${clipText(message.content, MAX_MESSAGE_CHARS)}`);
  const files = input.filesChanged.slice(0, 24).join(", ");
  const tools = input.toolNames.slice(0, 24).join(", ");
  return [
    `Goal: ${clipText(input.goal, 400)}`,
    files ? `Files touched: ${files}` : "Files touched: none",
    tools ? `Tools: ${tools}` : "Tools: none",
    "Transcript:",
    ...lines,
  ].join("\n");
}

export function formatFileExcerpts(excerpts: readonly FileExcerpt[]) {
  if (excerpts.length === 0) return "File excerpts: none";
  return [
    "File excerpts:",
    ...excerpts.map((excerpt) => `### ${excerpt.path}\n${excerpt.content}`),
  ].join("\n\n");
}

export function buildKnowledgeReflectUserPrompt(
  input: KnowledgeReflectInput,
  catalog: readonly KnowledgeCatalogItem[],
  excerpts: readonly FileExcerpt[] = [],
) {
  return [
    formatKnowledgeCatalog(catalog) || "(empty catalog)",
    formatKnowledgeConversation(input),
    formatFileExcerpts(excerpts),
  ].join("\n\n");
}

export function buildSpecAuthorUserPrompt(
  input: KnowledgeReflectInput,
  catalog: readonly KnowledgeCatalogItem[],
  excerpts: readonly FileExcerpt[] = [],
) {
  return `${buildKnowledgeReflectUserPrompt(input, catalog, excerpts)}\n\nWrite the project specification for this run.`;
}
