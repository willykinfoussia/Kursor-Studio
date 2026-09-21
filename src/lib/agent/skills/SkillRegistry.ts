import type { ContextFileStore } from "../context/types";
import { projectContextFiles, userContextFiles } from "../context/fileStores";
import { lexicalScore, tokenize } from "../context/tokens";
import { skillCapabilityId } from "../../capabilities/ids";
import { readDisabledCapabilityIds } from "../../capabilities/overlay";
import { normalizeSkillId } from "./ids";
import { BUILTIN_SKILLS, parseSkill } from "./parseSkill";
import type { SelectedSkill, SkillCatalogEntry, SkillDefinition, SkillListingItem } from "./types";

export const SKILL_LISTING_FULL_THRESHOLD = 48;
export const SKILL_LISTING_DETAIL_TOP = 8;

export interface SkillRegistryOptions {
  files?: ContextFileStore;
  globalFiles?: ContextFileStore;
  builtins?: SkillDefinition[];
  includeBuiltins?: boolean;
  getDisabledIds?: () => string[];
}

export class SkillRegistry {
  private files?: ContextFileStore;
  private globalFiles?: ContextFileStore;
  private readonly builtins: SkillDefinition[];
  private readonly enabled = new Map<string, boolean>();
  private project: SkillDefinition[] = [];
  private global: SkillDefinition[] = [];
  private getDisabledIds: () => string[];

  constructor(options: SkillRegistryOptions = {}) {
    this.files = options.files;
    this.globalFiles = options.globalFiles;
    this.getDisabledIds = options.getDisabledIds ?? readDisabledCapabilityIds;
    this.builtins = options.includeBuiltins === false
      ? []
      : (options.builtins ?? BUILTIN_SKILLS).map((skill) => ({ ...skill }));
  }

  bindFiles(files?: ContextFileStore, globalFiles?: ContextFileStore) {
    this.files = files;
    this.globalFiles = globalFiles;
  }

  bindDefaultFiles() {
    if (!this.files) this.files = projectContextFiles();
    if (!this.globalFiles) this.globalFiles = userContextFiles();
  }

  setEnabled(id: string, enabled: boolean) {
    this.enabled.set(id, enabled);
  }

  isAvailable(skill: SkillDefinition) {
    return this.isEnabled(skill);
  }

  get(id: string) {
    const needle = normalizeSkillId(id);
    return this.all().find((skill) => normalizeSkillId(skill.id) === needle);
  }

  async resolve(id: string, options?: { includeProject?: boolean }): Promise<SkillDefinition | null> {
    await this.discover(options?.includeProject !== false);
    const skill = this.get(id);
    if (!skill) return null;
    return { ...skill, enabled: this.isEnabled(skill) };
  }

  async listDefinitions(options?: { includeProject?: boolean }): Promise<SkillDefinition[]> {
    await this.discover(options?.includeProject !== false);
    return this.all().map((skill) => ({ ...skill, enabled: this.isEnabled(skill) }));
  }

  async listCatalog(options?: { includeProject?: boolean }): Promise<SkillCatalogEntry[]> {
    const skills = await this.listDefinitions(options);
    return skills.map((skill) => ({
      id: skill.id,
      name: skill.name,
      description: skill.description,
      triggers: [...skill.triggers],
      version: skill.version,
      enabled: skill.enabled,
      origin: skill.origin,
      sourcePath: skill.sourcePath,
      allowedTools: [...skill.allowedTools],
      modelPreference: skill.modelPreference,
      disableModelInvocation: skill.disableModelInvocation,
      userInvocable: skill.userInvocable,
    }));
  }

  async listForPrompt(request: string, options?: { includeProject?: boolean }): Promise<SkillListingItem[]> {
    await this.discover(options?.includeProject !== false);
    const scored = this.all()
      .filter((skill) => this.isEnabled(skill) && !skill.disableModelInvocation)
      .map((skill) => ({
        skill: { ...skill, enabled: true },
        score: matchScore(request, skill, activationHaystack(skill)),
      }))
      .sort((left, right) => right.score - left.score || left.skill.id.localeCompare(right.skill.id));
    const detailAll = scored.length <= SKILL_LISTING_FULL_THRESHOLD;
    const top = new Set(scored.slice(0, SKILL_LISTING_DETAIL_TOP).map((item) => item.skill.id));
    return scored.map((item) => ({
      ...item,
      detail: detailAll || top.has(item.skill.id),
    }));
  }

  async select(request: string, options?: { includeProject?: boolean }): Promise<SelectedSkill[]> {
    const listed = await this.listForPrompt(request, options);
    return listed
      .filter((item) => item.score > 0)
      .map((item) => ({ ...item.skill, score: item.score }));
  }

  private isEnabled(skill: SkillDefinition) {
    const capId = skillCapabilityId(skill.origin, skill.id);
    const disabled = this.getDisabledIds();
    if (disabled.includes(capId) || disabled.includes(skill.id)) return false;
    return this.enabled.get(skill.id) ?? skill.enabled;
  }

  private all() {
    const byId = new Map<string, SkillDefinition>();
    for (const skill of this.builtins) byId.set(skill.id, skill);
    for (const skill of this.global) byId.set(skill.id, skill);
    for (const skill of this.project) byId.set(skill.id, skill);
    return [...byId.values()];
  }

  private async discover(includeProject: boolean) {
    this.global = this.globalFiles
      ? await loadSkillDir(this.globalFiles, "skills", "global")
      : [];
    this.project = includeProject && this.files
      ? await loadSkillDir(this.files, ".kursor/skills", "project")
      : [];
  }
}

function isDirectoryEntry(entry: { kind: string }) {
  return entry.kind === "directory" || entry.kind === "dir" || entry.kind === "folder";
}

function skillMarkdownPath(directory: string, entry: { name: string; path: string }) {
  const folder = (entry.path || `${directory}/${entry.name}`).replace(/\\/g, "/").replace(/\/$/, "");
  return `${folder}/SKILL.md`;
}

async function loadSkillDir(
  files: ContextFileStore,
  directory: string,
  origin: SkillDefinition["origin"],
): Promise<SkillDefinition[]> {
  const entries = await files.listDirectory(directory).catch(() => []);
  const dirs = entries.filter(isDirectoryEntry);
  const candidates = (dirs.length > 0 ? dirs : entries)
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name));
  const loaded: SkillDefinition[] = [];
  for (const dir of candidates) {
    const path = skillMarkdownPath(directory, dir);
    const raw = await files.readFile(path).catch(() => "");
    if (!raw.trim()) continue;
    loaded.push(parseSkill(raw, dir.name, origin, path));
  }
  return loaded;
}

const STOP = new Set(["the", "and", "for", "when", "user", "asks", "use", "with", "this", "that", "from", "your", "into"]);

function activationHaystack(skill: SkillDefinition) {
  const descriptionTokens = tokenize(skill.description).filter((token) => !STOP.has(token) && token.length >= 4);
  return [skill.id, skill.name, ...skill.triggers, ...descriptionTokens].join("\n");
}

function matchScore(request: string, skill: SkillDefinition, haystack: string) {
  const lowered = request.toLowerCase();
  if (skill.triggers.some((trigger) => trigger && lowered.includes(trigger.toLowerCase()))) {
    return Math.max(lexicalScore(request, haystack), 0.5);
  }
  return lexicalScore(request, haystack);
}

export const skillRegistry = new SkillRegistry();
skillRegistry.bindDefaultFiles();
