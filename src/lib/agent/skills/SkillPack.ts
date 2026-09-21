import { BINARY_EXTENSIONS } from "../../filesystem/fileTypes";
import { parseSkill } from "./parseSkill";
import { assertSkillId, type SkillDraft, type SkillDraftFile } from "./SkillDocument";

export type SkillPackEntry = {
  path: string;
  content: string;
};

export type SkillPackSkill = {
  id: string;
  skillMd: string;
  files: SkillDraftFile[];
};

export const SKILL_PACK_SKIP_DIRS = new Set([
  ".git",
  "node_modules",
  "agents",
  "dist",
  "build",
  "target",
]);

const MAX_PACK_FILE_CHARS = 256_000;

export function normalizePackPath(path: string) {
  return path.replace(/\\/g, "/").replace(/^\.?\//, "").replace(/\/+/g, "/");
}

export function isSkippedPackPath(path: string) {
  const parts = normalizePackPath(path).split("/").filter(Boolean);
  return parts.some((part) => SKILL_PACK_SKIP_DIRS.has(part.toLowerCase()));
}

export function isBinaryPackPath(path: string) {
  const name = normalizePackPath(path).split("/").pop() ?? "";
  const dot = name.lastIndexOf(".");
  if (dot < 0) return false;
  return BINARY_EXTENSIONS.has(name.slice(dot + 1).toLowerCase());
}

export function isSkillMarkdownPath(path: string) {
  const name = normalizePackPath(path).split("/").pop() ?? "";
  return name.toLowerCase() === "skill.md";
}

function skillDirectory(skillMdPath: string) {
  const normalized = normalizePackPath(skillMdPath);
  const index = normalized.lastIndexOf("/");
  return index < 0 ? "" : normalized.slice(0, index);
}

function isUnder(path: string, directory: string) {
  if (!directory) return true;
  return path === directory || path.startsWith(`${directory}/`);
}

export function discoverSkillPacks(
  entries: readonly SkillPackEntry[],
  options: { rootName?: string } = {},
): SkillPackSkill[] {
  const files = entries
    .map((entry) => ({
      path: normalizePackPath(entry.path),
      content: entry.content.length > MAX_PACK_FILE_CHARS
        ? entry.content.slice(0, MAX_PACK_FILE_CHARS)
        : entry.content,
    }))
    .filter((entry) => entry.path && !isSkippedPackPath(entry.path) && !isBinaryPackPath(entry.path));

  const skillMarkdown = files.filter((entry) => isSkillMarkdownPath(entry.path));
  const skillDirs = skillMarkdown.map((entry) => skillDirectory(entry.path));
  const packs: SkillPackSkill[] = [];
  const seen = new Set<string>();

  for (const skill of skillMarkdown) {
    const directory = skillDirectory(skill.path);
    const folder = directory.split("/").filter(Boolean).pop() ?? directory;
    let id: string;
    try {
      id = assertSkillId(folder || options.rootName || "imported-skill");
    } catch {
      continue;
    }
    if (seen.has(id)) continue;
    seen.add(id);
    const nested = skillDirs.filter((dir) => dir !== directory && isUnder(dir, directory));
    const extras = files
      .filter((entry) => {
        if (!isUnder(entry.path, directory)) return false;
        if (entry.path === skill.path) return false;
        if (nested.some((dir) => isUnder(entry.path, dir))) return false;
        return true;
      })
      .map((entry) => ({
        path: directory ? entry.path.slice(directory.length + 1) : entry.path,
        content: entry.content,
      }))
      .sort((left, right) => left.path.localeCompare(right.path));
    packs.push({ id, skillMd: skill.content, files: extras });
  }

  return packs.sort((left, right) => left.id.localeCompare(right.id));
}

export function packToDraft(pack: SkillPackSkill): SkillDraft {
  const parsed = parseSkill(pack.skillMd, pack.id, "project");
  return {
    id: pack.id,
    name: parsed.name,
    description: parsed.description,
    triggers: parsed.triggers,
    allowedTools: parsed.allowedTools,
    instructions: parsed.instructions,
    version: parsed.version,
    enabled: parsed.enabled,
    modelPreference: parsed.modelPreference,
    disableModelInvocation: parsed.disableModelInvocation,
    userInvocable: parsed.userInvocable,
    rawMarkdown: pack.skillMd,
    files: pack.files,
  };
}

export async function entriesFromFileList(files: Iterable<File>): Promise<SkillPackEntry[]> {
  const entries: SkillPackEntry[] = [];
  for (const file of files) {
    const path = normalizePackPath(file.webkitRelativePath || file.name);
    if (!path || isSkippedPackPath(path) || isBinaryPackPath(path)) continue;
    entries.push({ path, content: await file.text() });
  }
  return entries;
}

type DirectoryReader = {
  readEntries: (success: (entries: FileSystemEntryLike[]) => void, error?: (error: Error) => void) => void;
};

type FileSystemEntryLike = {
  isFile: boolean;
  isDirectory: boolean;
  name: string;
  fullPath?: string;
  file?: (success: (file: File) => void, error?: (error: Error) => void) => void;
  createReader?: () => DirectoryReader;
};

export async function entriesFromDataTransfer(transfer: DataTransfer | null): Promise<SkillPackEntry[]> {
  if (!transfer) return [];
  const items = [...transfer.items];
  if (items.some((item) => typeof item.webkitGetAsEntry === "function")) {
    const walked: SkillPackEntry[] = [];
    for (const item of items) {
      const entry = item.webkitGetAsEntry?.() as FileSystemEntryLike | null;
      if (entry) await walkFileSystemEntry(entry, "", walked);
    }
    if (walked.length > 0) return walked;
  }
  return entriesFromFileList(transfer.files);
}

async function walkFileSystemEntry(
  entry: FileSystemEntryLike,
  parent: string,
  out: SkillPackEntry[],
) {
  const relative = parent ? `${parent}/${entry.name}` : entry.name;
  if (isSkippedPackPath(relative)) return;
  if (entry.isFile && entry.file) {
    const file = await new Promise<File>((resolve, reject) => {
      entry.file!(resolve, reject);
    });
    if (isBinaryPackPath(relative)) return;
    out.push({ path: relative, content: await file.text() });
    return;
  }
  if (!entry.isDirectory || !entry.createReader) return;
  const reader = entry.createReader();
  const children: FileSystemEntryLike[] = [];
  for (;;) {
    const batch = await new Promise<FileSystemEntryLike[]>((resolve, reject) => {
      reader.readEntries(resolve, reject);
    });
    if (batch.length === 0) break;
    children.push(...batch);
  }
  for (const child of children) {
    await walkFileSystemEntry(child, relative, out);
  }
}
