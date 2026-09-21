import { fileSystemService } from "../../filesystem/FileSystemService";
import { useProjectStore } from "../../../stores/projectStore";
import { userDataApi } from "../../tauri/userDataApi";
import { BUILTIN_SKILLS, listBuiltinSupporting, parseSkill, readBuiltinSupporting } from "./parseSkill";
import { normalizeSkillId } from "./ids";

export type SkillDocumentScope = "project" | "user";
export type SkillFileOrigin = "builtin" | "project" | "global" | "user";

export type SkillDraftFile = {
  path: string;
  content: string;
};

export type SkillDraft = {
  id: string;
  name?: string;
  description?: string;
  triggers?: readonly string[];
  allowedTools?: readonly string[];
  instructions?: string;
  version?: string;
  enabled?: boolean;
  modelPreference?: string | null;
  disableModelInvocation?: boolean;
  userInvocable?: boolean;
  rawMarkdown?: string;
  files?: readonly SkillDraftFile[];
};

export class SkillDocumentError extends Error {
  constructor(
    public readonly code:
      | "invalid_id"
      | "invalid_path"
      | "no_project"
      | "builtin_readonly"
      | "already_exists"
      | "not_found",
    message: string,
  ) {
    super(message);
    this.name = "SkillDocumentError";
  }
}

export const SKILL_ID_PATTERN = /^[a-z][\w.-]*$/;

export type ProjectSkillFiles = {
  hasProject: () => boolean;
  readFile: (path: string) => Promise<string>;
  writeFile: (path: string, content: string) => Promise<void>;
  createDirectory: (path: string) => Promise<void>;
  delete: (path: string) => Promise<void>;
  listFiles: (directory: string) => Promise<string[]>;
};

export type UserSkillFiles = {
  read: (relative: string) => Promise<string>;
  write: (relative: string, content: string) => Promise<void>;
  delete: (relative: string) => Promise<void>;
  listFiles: (directory: string) => Promise<string[]>;
};

export type SkillDocumentStores = {
  project?: ProjectSkillFiles;
  user?: UserSkillFiles;
  builtins?: () => readonly { id: string }[];
};

export function assertSkillId(id: string) {
  const normalized = normalizeSkillId(id).replace(/\s+/g, "-");
  if (!SKILL_ID_PATTERN.test(normalized)) {
    throw new SkillDocumentError(
      "invalid_id",
      `Skill id "${id}" is invalid. Use a folder name like search-first.`,
    );
  }
  return normalized;
}

export function splitSkillList(value: string) {
  return value.split(/[,;\n]/).map((item) => item.trim()).filter(Boolean);
}

export function shadowsBuiltin(id: string, builtins: readonly { id: string }[] = BUILTIN_SKILLS) {
  const needle = normalizeSkillId(id);
  return builtins.some((skill) => normalizeSkillId(skill.id) === needle);
}

export function serializeSkill(draft: SkillDraft) {
  const id = assertSkillId(draft.id);
  const name = draft.name?.trim() || id;
  const description = draft.description?.trim() || "";
  const triggers = [...(draft.triggers ?? [])].map((item) => item.trim()).filter(Boolean);
  const allowedTools = [...(draft.allowedTools ?? [])].map((item) => item.trim()).filter(Boolean);
  const version = draft.version?.trim() || "1.0";
  const enabled = draft.enabled !== false;
  const instructions = (draft.instructions ?? "").trim();
  const lines = [
    "---",
    `name: ${yamlScalar(name)}`,
    `description: ${yamlScalar(description)}`,
    `triggers: ${yamlList(triggers)}`,
    `allowedTools: ${yamlList(allowedTools)}`,
    `version: ${yamlScalar(version)}`,
    `enabled: ${enabled}`,
  ];
  const preference = draft.modelPreference?.trim();
  if (preference) lines.push(`modelPreference: ${yamlScalar(preference)}`);
  if (draft.disableModelInvocation) lines.push("disableModelInvocation: true");
  if (draft.userInvocable === false) lines.push("userInvocable: false");
  lines.push("---");
  if (instructions) lines.push(instructions);
  return `${lines.join("\n")}\n`;
}

export function projectSkillDir(id: string) {
  return `.kursor/skills/${assertSkillId(id)}`;
}

export function projectSkillPath(id: string) {
  return `${projectSkillDir(id)}/SKILL.md`;
}

export function userSkillRelativePath(id: string) {
  return `${assertSkillId(id)}/SKILL.md`;
}

export function assertSkillRelativePath(relative: string) {
  const cleaned = relative.replace(/\\/g, "/").replace(/^\/+/, "").replace(/\/+/g, "/");
  if (!cleaned || cleaned === "." || cleaned.toLowerCase() === "skill.md") {
    throw new SkillDocumentError("invalid_path", `Supporting file "${relative}" is invalid.`);
  }
  const parts = cleaned.split("/");
  if (parts.some((part) => !part || part === "." || part === "..")) {
    throw new SkillDocumentError("invalid_path", `Supporting file "${relative}" is invalid.`);
  }
  return cleaned;
}

export function originToScope(origin: SkillFileOrigin): SkillDocumentScope {
  return origin === "user" || origin === "global" ? "user" : "project";
}

export class SkillDocumentService {
  constructor(private readonly stores: SkillDocumentStores = {}) {}

  async create(scope: SkillDocumentScope, draft: SkillDraft) {
    const id = assertSkillId(draft.id);
    if (await this.exists(scope, id)) {
      throw new SkillDocumentError("already_exists", `Skill "${id}" already exists.`);
    }
    await this.write(scope, id, skillMarkdown(draft, id), draft.files);
    return { scope, id, path: this.pathFor(scope, id) };
  }

  async update(scope: SkillDocumentScope, draft: SkillDraft) {
    const id = assertSkillId(draft.id);
    if (!(await this.exists(scope, id))) {
      throw new SkillDocumentError("not_found", `Skill "${id}" was not found.`);
    }
    await this.write(scope, id, skillMarkdown(draft, id), draft.files, { syncExtras: draft.files !== undefined });
    return { scope, id, path: this.pathFor(scope, id) };
  }

  async remove(scope: SkillDocumentScope, id: string) {
    const normalized = assertSkillId(id);
    if (!(await this.exists(scope, normalized))) {
      throw new SkillDocumentError("not_found", `Skill "${normalized}" was not found.`);
    }
    if (scope === "project") {
      await this.projectFiles().delete(projectSkillDir(normalized));
      return;
    }
    await this.userFiles().delete(normalized);
  }

  async exists(scope: SkillDocumentScope, id: string) {
    const normalized = assertSkillId(id);
    if (scope === "project") {
      const raw = await this.projectFiles().readFile(projectSkillPath(normalized)).catch(() => "");
      return Boolean(raw.trim());
    }
    const raw = await this.userFiles().read(userSkillRelativePath(normalized)).catch(() => "");
    return Boolean(raw.trim());
  }

  async read(scope: SkillDocumentScope, id: string) {
    const normalized = assertSkillId(id);
    const raw = scope === "project"
      ? await this.projectFiles().readFile(projectSkillPath(normalized)).catch(() => "")
      : await this.userFiles().read(userSkillRelativePath(normalized)).catch(() => "");
    if (!raw.trim()) {
      throw new SkillDocumentError("not_found", `Skill "${normalized}" was not found.`);
    }
    const parsed = parseSkill(raw, normalized, scope === "user" ? "global" : "project");
    const files = await this.readSupportingFiles(scope, normalized);
    return {
      id: parsed.id,
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
      files,
    } satisfies SkillDraft;
  }

  async listSupporting(origin: SkillFileOrigin, id: string) {
    const normalized = assertSkillId(id);
    if (origin === "builtin") return listBuiltinSupporting(normalized);
    return this.listSupportingInScope(originToScope(origin), normalized);
  }

  async readSupporting(origin: SkillFileOrigin, id: string, relative: string) {
    const normalized = assertSkillId(id);
    const file = assertSkillRelativePath(relative);
    if (origin === "builtin") {
      const content = readBuiltinSupporting(normalized, file);
      if (content == null) {
        throw new SkillDocumentError("not_found", `Supporting file "${file}" was not found.`);
      }
      return content;
    }
    const scope = originToScope(origin);
    const listed = await this.listSupportingInScope(scope, normalized);
    if (!listed.includes(file)) {
      throw new SkillDocumentError("not_found", `Supporting file "${file}" was not found.`);
    }
    return scope === "project"
      ? this.projectFiles().readFile(`${projectSkillDir(normalized)}/${file}`)
      : this.userFiles().read(`${normalized}/${file}`);
  }

  shadowsBuiltin(id: string) {
    return shadowsBuiltin(id, this.stores.builtins?.() ?? BUILTIN_SKILLS);
  }

  private pathFor(scope: SkillDocumentScope, id: string) {
    return scope === "project" ? projectSkillPath(id) : `skills/${userSkillRelativePath(id)}`;
  }

  private async write(
    scope: SkillDocumentScope,
    id: string,
    content: string,
    files?: readonly SkillDraftFile[],
    options: { syncExtras?: boolean } = {},
  ) {
    if (scope === "project") {
      const store = this.projectFiles();
      await store.createDirectory(".kursor").catch(() => undefined);
      await store.createDirectory(".kursor/skills").catch(() => undefined);
      await store.createDirectory(projectSkillDir(id)).catch(() => undefined);
      await store.writeFile(projectSkillPath(id), content);
      await this.writeExtras(scope, id, files ?? []);
      if (options.syncExtras) await this.removeMissingExtras(scope, id, files ?? []);
      return;
    }
    await this.userFiles().write(userSkillRelativePath(id), content);
    await this.writeExtras(scope, id, files ?? []);
    if (options.syncExtras) await this.removeMissingExtras(scope, id, files ?? []);
  }

  private async writeExtras(scope: SkillDocumentScope, id: string, files: readonly SkillDraftFile[]) {
    for (const file of files) {
      const relative = assertSkillRelativePath(file.path);
      if (scope === "project") {
        const store = this.projectFiles();
        const full = `${projectSkillDir(id)}/${relative}`;
        await ensureProjectParents(store, full);
        await store.writeFile(full, file.content);
        continue;
      }
      await this.userFiles().write(`${id}/${relative}`, file.content);
    }
  }

  private async removeMissingExtras(scope: SkillDocumentScope, id: string, files: readonly SkillDraftFile[]) {
    const keep = new Set(files.map((file) => assertSkillRelativePath(file.path)));
    for (const path of await this.listSupportingInScope(scope, id)) {
      if (keep.has(path)) continue;
      if (scope === "project") {
        await this.projectFiles().delete(`${projectSkillDir(id)}/${path}`);
        continue;
      }
      await this.userFiles().delete(`${id}/${path}`);
    }
  }

  private async listSupportingInScope(scope: SkillDocumentScope, id: string) {
    const prefix = scope === "project" ? `${projectSkillDir(id)}/` : `${id}/`;
    const listed = scope === "project"
      ? await this.projectFiles().listFiles(projectSkillDir(id)).catch(() => [])
      : await this.userFiles().listFiles(id).catch(() => []);
    return unique(listed
      .map((path) => path.replace(/\\/g, "/"))
      .filter((path) => path.startsWith(prefix) || (!path.includes("/") && scope === "user"))
      .map((path) => path.startsWith(prefix) ? path.slice(prefix.length) : path)
      .filter((path) => path && path.toLowerCase() !== "skill.md"))
      .sort((left, right) => left.localeCompare(right));
  }

  private async readSupportingFiles(scope: SkillDocumentScope, id: string): Promise<SkillDraftFile[]> {
    const names = await this.listSupportingInScope(scope, id);
    const files: SkillDraftFile[] = [];
    for (const path of names) {
      const content = scope === "project"
        ? await this.projectFiles().readFile(`${projectSkillDir(id)}/${path}`).catch(() => "")
        : await this.userFiles().read(`${id}/${path}`).catch(() => "");
      files.push({ path, content });
    }
    return files;
  }

  private projectFiles(): ProjectSkillFiles {
    const files = this.stores.project ?? defaultProjectFiles();
    if (!files.hasProject()) {
      throw new SkillDocumentError("no_project", "Open a project before creating a project skill.");
    }
    return files;
  }

  private userFiles(): UserSkillFiles {
    return this.stores.user ?? defaultUserFiles();
  }
}

function yamlScalar(value: string) {
  if (!value) return '""';
  if (/[:#\[\]{},&*!|>'"%@`\n]/.test(value) || value !== value.trim()) {
    return JSON.stringify(value);
  }
  return value;
}

function yamlList(items: readonly string[]) {
  return `[${items.map((item) => yamlScalar(item)).join(", ")}]`;
}

function skillMarkdown(draft: SkillDraft, id: string) {
  return draft.rawMarkdown?.trim() ? draft.rawMarkdown.replace(/\r\n/g, "\n") : serializeSkill({ ...draft, id });
}

async function ensureProjectParents(files: ProjectSkillFiles, filePath: string) {
  const parts = filePath.split("/").filter(Boolean);
  let acc = "";
  for (const part of parts.slice(0, -1)) {
    acc = acc ? `${acc}/${part}` : part;
    await files.createDirectory(acc).catch(() => undefined);
  }
}

function unique(values: string[]) {
  return [...new Set(values)];
}

function listedUnder(directory: string, paths: readonly string[]) {
  const prefix = `${directory.replace(/\\/g, "/").replace(/\/$/, "")}/`;
  return paths
    .map((path) => path.replace(/\\/g, "/"))
    .filter((path) => path.startsWith(prefix));
}

function defaultProjectFiles(): ProjectSkillFiles {
  return {
    hasProject: () => Boolean(useProjectStore.getState().currentProject),
    readFile: (path) => fileSystemService.readFile(path),
    writeFile: (path, content) => fileSystemService.writeFile(path, content),
    createDirectory: (path) => fileSystemService.createDirectory(path),
    delete: (path) => fileSystemService.delete(path),
    listFiles: async (directory) => {
      const walked = await fileSystemService.walkFiles().catch(() => []);
      return listedUnder(directory, walked.map((file) => file.relativePath));
    },
  };
}

function defaultUserFiles(): UserSkillFiles {
  return {
    read: (relative) => userDataApi.read("skills", relative),
    write: (relative, content) => userDataApi.write("skills", relative, content),
    delete: (relative) => userDataApi.delete("skills", relative),
    listFiles: async (directory) => {
      const walked = await userDataApi.walk("skills").catch(() => []);
      return listedUnder(directory, walked.map((file) => file.relativePath));
    },
  };
}

export const skillDocuments = new SkillDocumentService();
