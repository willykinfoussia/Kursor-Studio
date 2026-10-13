import { normalizeRelativePath } from "../filesystem/pathUtils";

export const CODEGRAPH_DIR = ".codegraph";
export const GRAPHIFY_DIR = "graphify-out";
export const GRAPHIFY_HTML = `${GRAPHIFY_DIR}/graph.html`;
export const GRAPHIFY_JSON = `${GRAPHIFY_DIR}/graph.json`;
export const GRAPHIFY_NEEDS_UPDATE = `${GRAPHIFY_DIR}/needs_update`;
export const GITIGNORE_PATH = ".gitignore";

const IGNORE_LINES = [`${CODEGRAPH_DIR}/`, `${GRAPHIFY_DIR}/`] as const;

export function isCodeIntelPath(filePath: string): boolean {
  const normalized = normalizeRelativePath(filePath);
  return normalized === CODEGRAPH_DIR
    || normalized.startsWith(`${CODEGRAPH_DIR}/`)
    || normalized === GRAPHIFY_DIR
    || normalized.startsWith(`${GRAPHIFY_DIR}/`);
}

export function withCodeIntelGitignore(content: string): string {
  const present = new Set(
    content.split(/\r?\n/).map((line) => line.trim()).filter(Boolean),
  );
  const missing = IGNORE_LINES.filter((line) => !present.has(line) && !present.has(line.replace(/\/$/, "")));
  if (missing.length === 0) return content;
  const base = content.length === 0 || content.endsWith("\n") ? content : `${content}\n`;
  return `${base}${missing.join("\n")}\n`;
}
