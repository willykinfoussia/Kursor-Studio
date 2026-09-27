import { PROJECT_GROUP_KINDS } from "../../graph/classify";
import { titleFromFileName } from "../../graph/createSpec";
import { parseSpecFrontmatter, specFrontmatterBlock } from "../../graph/extract/frontmatter";
import { extractJsonObject, specFileNameFromLabel } from "./schema";

const PROJECT_KINDS = new Set<string>(PROJECT_GROUP_KINDS);

const SECTION_CHECKS = [
  /intention|intent|philosophie|philosophy/i,
  /architecture/i,
  /structure/i,
  /d[ée]cisions?|decisions?|contraintes?|constraints?/i,
];

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

export function isSubstantialSpec(content: string): boolean {
  const body = parseSpecFrontmatter(content).body.trim();
  if (body.length < 80) return false;
  if (isFileListOnly(content)) return false;
  return SECTION_CHECKS.filter((pattern) => pattern.test(body)).length >= 3;
}

export function hasSubstantialProductSpec(result: { specActions: { action: string; content?: string }[] }): boolean {
  return result.specActions.some((action) =>
    (action.action === "create" || action.action === "update") && isSubstantialSpec(action.content ?? ""),
  );
}

export function goalUsesFrench(goal: string): boolean {
  return /[àâäéèêëïîôùûüçœ]/i.test(goal)
    || /\b(le|la|les|des|une|un|pour|avec|dans|sur|cette|am[eé]liore|ajoute|rajoute)\b/i.test(goal);
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
