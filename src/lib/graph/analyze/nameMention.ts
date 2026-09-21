import { STOP_WORDS } from "../config";

const GENERIC_FILE_BASENAMES = new Set([
  "index", "main", "app", "src", "lib", "test", "tests", "util", "utils",
  "types", "data", "config", "mod", "init",
]);

export function isMeaningfulBasename(basename: string): boolean {
  const normalized = basename.trim().toLowerCase();
  if (normalized.length < 4) return false;
  if (STOP_WORDS.has(normalized)) return false;
  if (GENERIC_FILE_BASENAMES.has(normalized)) return false;
  return true;
}

export function contentMentionsBasename(content: string, basename: string): boolean {
  if (!content || !isMeaningfulBasename(basename)) return false;
  const escaped = basename.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`\\b${escaped}\\b`, "i").test(content);
}
