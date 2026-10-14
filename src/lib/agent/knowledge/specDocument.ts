import { PROJECT_GROUP_KINDS } from "../../graph/classify";
import { titleFromFileName } from "../../graph/createSpec";
import { parseSpecFrontmatter, specFrontmatterBlock } from "../../graph/extract/frontmatter";
import { extractJsonObject, specFileNameFromLabel } from "./schema";

const PROJECT_KINDS = new Set<string>(PROJECT_GROUP_KINDS);

const BOILERPLATE = [
  /ces modules réalisent l['’]intention/i,
  /these modules carry the intention/i,
  /les contraintes durables sont celles que le code modifié rend visibles/i,
  /the lasting constraints are the ones the changed code makes visible/i,
];

type SpecSectionName = "intention" | "architecture" | "structure" | "decisions" | "files";

const SECTION_HEADINGS: { name: SpecSectionName; pattern: RegExp }[] = [
  { name: "intention", pattern: /^(?:intention|intent|philosophie|philosophy)\b/i },
  { name: "architecture", pattern: /^architecture\b/i },
  { name: "structure", pattern: /^structure\b/i },
  { name: "decisions", pattern: /^(?:d[ée]cisions?|decisions?|contraintes?|constraints?)\b/i },
  { name: "files", pattern: /^(?:fichiers|files)\b/i },
];

const PROSE_SECTIONS: SpecSectionName[] = ["intention", "architecture", "structure", "decisions"];

export function projectSpecKind(value: string | undefined): string {
  const kind = value?.trim().toLowerCase() ?? "";
  if (PROJECT_KINDS.has(kind) && kind !== "documentation") return kind;
  return "architecture";
}

export function authorFileName(label: string, goal: string): string {
  const base = label.split(/[/\\]/).pop()?.trim().replace(/\.md$/i, "") ?? "";
  return specFileNameFromLabel(base || goal);
}

function yamlSafe(value: string): string {
  return value.replace(/[\r\n]+/g, " ").replace(/:/g, " - ").trim() || "Untitled";
}

export function ensureSpecFrontmatter(
  content: string,
  options: { scope: "account" | "project"; kind?: string; fileName?: string; title?: string },
): string {
  const parsed = parseSpecFrontmatter(content);
  if (parsed.data.scope && parsed.data.type) return content;
  const heading = parsed.body.match(/^#\s+(.+)$/m)?.[1]?.trim();
  const title = yamlSafe(options.title || parsed.data.title || heading || titleFromFileName(options.fileName || "untitled.md"));
  const type = options.kind || parsed.data.type || (options.scope === "account" ? "preference" : "architecture");
  const body = parsed.body.replace(/^\s+/, "");
  return `${specFrontmatterBlock(options.scope, type, title)}${body}`;
}

export function isFileListOnly(content: string): boolean {
  const body = parseSpecFrontmatter(content).body.trim();
  const lines = body
    .replace(/^#{1,6}\s+.*$/gm, "")
    .split(/\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length === 0) return true;
  return lines.every((line) =>
    /^files touched:?$/i.test(line)
    || /^fichiers:?$/i.test(line)
    || /^[-*]\s+`?[\w./\\-]+`?$/.test(line),
  );
}

function specSections(body: string): Map<SpecSectionName, string> {
  const buffers = new Map<SpecSectionName, string[]>();
  let current: SpecSectionName | null = null;
  for (const line of body.split(/\n/)) {
    const heading = line.match(/^#{1,6}\s+(.+?)\s*$/);
    if (heading) {
      const title = heading[1].trim();
      current = SECTION_HEADINGS.find((item) => item.pattern.test(title))?.name ?? null;
      if (current && !buffers.has(current)) buffers.set(current, []);
      continue;
    }
    if (!current) continue;
    const list = buffers.get(current) ?? [];
    list.push(line);
    buffers.set(current, list);
  }
  const sections = new Map<SpecSectionName, string>();
  for (const [name, lines] of buffers) sections.set(name, lines.join("\n").trim());
  return sections;
}

function isRealSentence(text: string): boolean {
  const prose = text
    .split(/\n/)
    .map((line) => line.trim())
    .filter((line) => line && !/^[-*]\s+`?[\w./\\-]+`?(?:\s+[—-].*)?$/.test(line))
    .join(" ")
    .trim();
  if (!prose || BOILERPLATE.some((pattern) => pattern.test(prose))) return false;
  const words = prose.split(/\s+/).filter(Boolean);
  return prose.length >= 40 && words.length >= 6 && /[.!?…]/.test(prose);
}

export function isSubstantialSpec(content: string): boolean {
  const body = parseSpecFrontmatter(content).body.trim();
  if (isFileListOnly(content)) return false;
  if (BOILERPLATE.some((pattern) => pattern.test(body))) return false;
  const sections = specSections(body);
  const required: SpecSectionName[] = [...PROSE_SECTIONS, "files"];
  if (required.some((name) => !(sections.get(name) ?? "").trim())) return false;
  return PROSE_SECTIONS.every((name) => isRealSentence(sections.get(name) ?? ""));
}

export function hasSubstantialProductSpec(result: { specActions: { action: string; content?: string }[] }): boolean {
  return result.specActions.some((action) =>
    (action.action === "create" || action.action === "update") && isSubstantialSpec(action.content ?? ""),
  );
}

export interface SpecAuthorDraft {
  kind?: string;
  fileName?: string;
  title?: string;
  content: string;
}

export function parseSpecAuthorResult(raw: string): SpecAuthorDraft | null {
  const json = extractJsonObject(raw);
  if (json && typeof json === "object") {
    const record = json as Record<string, unknown>;
    const content = typeof record.content === "string" ? record.content.trim() : "";
    if (content) {
      return {
        kind: typeof record.kind === "string" ? record.kind : undefined,
        fileName: typeof record.fileName === "string" ? record.fileName : undefined,
        title: typeof record.title === "string" ? record.title : undefined,
        content,
      };
    }
  }
  const text = raw.trim();
  if (text.startsWith("#") || text.includes("## ")) return { content: text };
  return null;
}
