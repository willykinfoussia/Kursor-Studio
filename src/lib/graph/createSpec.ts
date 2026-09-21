import {
  isSpecKind,
  newAccountSpecPath,
  newProjectSpecPath,
  newSpecGroupPath,
  sanitizeSpecGroupName,
  type SpecKind,
} from "./classify";
import { specFrontmatterBlock } from "./extract/frontmatter";
import type { GraphFileStore } from "./types";

export function titleFromFileName(fileName: string): string {
  return fileName
    .replace(/\.md$/i, "")
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase())
    .trim() || "Untitled";
}

export function specFileContent(scope: "account" | "project", type: string, fileName: string): string {
  const title = titleFromFileName(fileName);
  return `${specFrontmatterBlock(scope, type, title)}# ${title}\n`;
}

export async function ensureNestedDirectory(files: GraphFileStore, directory: string) {
  if (!files.createDirectory || !directory) return;
  const parts = directory.split("/").filter(Boolean);
  let current = "";
  for (const part of parts) {
    current = current ? `${current}/${part}` : part;
    if (current === "account") continue;
    try {
      await files.createDirectory(current);
    } catch {
      // already exists
    }
  }
}

function resolveWriteType(options: { scope: "account" | "project"; kind?: SpecKind; group?: string }): string {
  const group = options.group ? sanitizeSpecGroupName(options.group) : "";
  if (group) {
    if (isSpecKind(group) && group !== "generic") {
      if (options.scope === "project" && group === "preference") return "documentation";
      return group;
    }
    return group;
  }
  if (options.kind && isSpecKind(options.kind) && options.kind !== "generic") {
    if (options.scope === "project" && options.kind === "preference") return "documentation";
    return options.kind;
  }
  return options.scope === "account" ? "preference" : "documentation";
}

export async function writeNewSpec(
  files: GraphFileStore,
  options: { scope: "account" | "project"; kind?: SpecKind; group?: string; fileName: string },
): Promise<string> {
  const type = resolveWriteType(options);
  const group = options.group ? sanitizeSpecGroupName(options.group) || undefined : undefined;
  const kind = (isSpecKind(type) ? type : "documentation") as SpecKind;
  const accountGroup = group ?? (
    options.kind && isSpecKind(options.kind) && options.kind !== "generic"
      ? sanitizeSpecGroupName(options.kind)
      : undefined
  );
  const path = options.scope === "account"
    ? newAccountSpecPath(options.fileName, accountGroup)
    : newProjectSpecPath(kind, options.fileName, group ?? (isSpecKind(type) ? undefined : type));
  const parent = path.split("/").slice(0, -1).join("/");
  await ensureNestedDirectory(files, parent);
  await files.writeFile(path, specFileContent(options.scope, type, options.fileName));
  return path;
}

export async function createSpecGroup(
  files: GraphFileStore,
  scope: "account" | "project",
  group: string,
): Promise<string> {
  const folder = sanitizeSpecGroupName(group);
  if (!folder) throw new Error("Group name is required.");
  const path = newSpecGroupPath(scope, folder);
  await ensureNestedDirectory(files, path);
  return path;
}

async function directoryNames(files: GraphFileStore, directory: string): Promise<string[]> {
  if (files.listDirectory) {
    try {
      return (await files.listDirectory(directory))
        .filter((entry) => entry.kind === "directory" && !entry.name.startsWith("."))
        .map((entry) => entry.name);
    } catch {
      // missing directory
    }
  }
  const prefix = directory.replace(/\/+$/, "");
  const walked = await files.walkFiles().catch(() => []);
  const names = new Set<string>();
  for (const entry of walked) {
    const relative = entry.relativePath.replace(/\\/g, "/");
    if (!relative.startsWith(`${prefix}/`)) continue;
    const rest = relative.slice(prefix.length + 1);
    const slash = rest.indexOf("/");
    if (slash === -1) continue;
    const name = rest.slice(0, slash);
    if (name && !name.startsWith(".")) names.add(name);
  }
  return [...names];
}

export async function listSpecGroups(
  files: GraphFileStore,
  scope: "account" | "project",
): Promise<string[]> {
  const names = new Set<string>();
  if (scope === "account") {
    for (const name of await directoryNames(files, "account/specs")) names.add(name);
    return [...names].sort((left, right) => left.localeCompare(right));
  }
  for (const name of await directoryNames(files, ".kursor/specs/project")) names.add(name);
  for (const name of await directoryNames(files, ".kursor/specs")) {
    if (name !== "project") names.add(name);
  }
  for (const name of await directoryNames(files, "specs")) names.add(name);
  return [...names].sort((left, right) => left.localeCompare(right));
}
