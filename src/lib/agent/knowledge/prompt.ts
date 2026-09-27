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
- Skill = reusable procedure (how to do the work). Spec = durable product knowledge: the architecture, structure, and idea behind the code.
- Do not propose anything already covered by the catalog.
- If the run mutated files to implement a product or feature, you MUST propose a spec create unless an equivalent spec already exists in the catalog. If it exists, update that spec instead of creating another.
- Spec content is markdown in the language of the goal. Required sections: Intention (why this exists), Architecture (how the pieces fit), Structure (each module's role), Décisions (lasting choices and constraints), Fichiers (each file with one sentence on its role).
- A heading followed by a file list is not a spec. Describe the system, not the task log.
- Ignore ephemeral task state, one-off bug traces, and disposable code snippets.
- delete / reorganize only with strong evidence a spec is obsolete or in the wrong group.
- Prefer empty arrays only when nothing durable was learned and no product files were implemented.
- Never invent secrets. Keep skill drafts short. Spec content must be specific to the code excerpts.`;

export const SPEC_AUTHOR_SYSTEM = `You write one durable project specification from a finished coding run.

Return JSON only:
{ "summary": "one line", "kind": "architecture", "fileName": "short-name.md", "title": "", "content": "markdown" }

The content is a project spec in the language of the goal. It describes the architecture, structure, and idea behind the code, not a task log.
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

export function formatKnowledgeCatalog(items: readonly KnowledgeCatalogItem[]) {
  return items.slice(0, MAX_CATALOG).map((item) => {
    if (item.kind === "skill") {
      return `- skill ${item.id} (${item.origin ?? "project"}): ${clipText(item.description ?? "", 160)}`;
    }
    return `- spec ${item.path ?? item.id} [${item.scope ?? "project"}/${item.title || item.id}]: ${clipText(item.description ?? "", 120)}`;
  }).join("\n");
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
