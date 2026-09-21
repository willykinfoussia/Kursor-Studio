import { asBoolean, asString, asStringList, parseFrontmatter } from "../yaml";
import type { SkillDefinition } from "./types";

const builtinMarkdown = import.meta.glob("./builtin/*/SKILL.md", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

const builtinTree = import.meta.glob("./builtin/**/*", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

const superpowersMarkdown = import.meta.glob(
  "../../../../code editors/superpowers/skills/*/SKILL.md",
  { query: "?raw", import: "default", eager: true },
) as Record<string, string>;

const superpowersTree = import.meta.glob(
  "../../../../code editors/superpowers/skills/**/*",
  { query: "?raw", import: "default", eager: true },
) as Record<string, string>;

export function parseSkill(
  raw: string,
  id: string,
  origin: SkillDefinition["origin"] = "project",
  sourcePath?: string,
): SkillDefinition {
  const parsed = parseFrontmatter(raw);
  const name = asString(parsed.data.name)?.trim() || id;
  const description = asString(parsed.data.description)?.trim() || "";
  return {
    id,
    name,
    description,
    triggers: asStringList(parsed.data.triggers),
    instructions: parsed.body.trim(),
    allowedTools: asStringList(parsed.data.allowedTools ?? parsed.data.tools),
    modelPreference: asString(parsed.data.modelPreference),
    version: asString(parsed.data.version)?.trim() || "1.0",
    enabled: asBoolean(parsed.data.enabled, true),
    origin,
    sourcePath,
    requiredCapabilities: asStringList(parsed.data.requiredCapabilities),
    preferredMcp: asStringList(parsed.data.preferredMcp),
    disableModelInvocation: asBoolean(
      parsed.data.disableModelInvocation ?? parsed.data["disable-model-invocation"],
      false,
    ),
    userInvocable: asBoolean(
      parsed.data.userInvocable ?? parsed.data["user-invocable"],
      true,
    ),
  };
}

function builtinIdFromPath(path: string) {
  const parts = path.replace(/\\/g, "/").split("/").filter(Boolean);
  return parts.at(-2) ?? "";
}

function skillsFromMarkdown(entries: Record<string, string>): SkillDefinition[] {
  return Object.entries(entries)
    .map(([path, raw]) => {
      const id = builtinIdFromPath(path);
      return id ? parseSkill(raw, id, "builtin", path) : null;
    })
    .filter((skill): skill is SkillDefinition => Boolean(skill));
}

const HIDDEN_SUPERPOWERS_SKILL_IDS = new Set(["subagent-driven-development"]);

const mergedSkills = new Map<string, SkillDefinition>();
for (const skill of skillsFromMarkdown(superpowersMarkdown)) {
  if (HIDDEN_SUPERPOWERS_SKILL_IDS.has(skill.id)) continue;
  mergedSkills.set(skill.id, skill);
}
for (const skill of skillsFromMarkdown(builtinMarkdown)) mergedSkills.set(skill.id, skill);

export const BUILTIN_SKILLS: SkillDefinition[] = [...mergedSkills.values()]
  .sort((left, right) => left.id.localeCompare(right.id));

const preferConst = BUILTIN_SKILLS.find((skill) => skill.id === "prefer-const");
export const PREFER_CONST_SKILL_MD = preferConst
  ? `---
name: ${preferConst.name}
description: ${preferConst.description}
triggers: [${preferConst.triggers.join(", ")}]
allowedTools: [${preferConst.allowedTools.join(", ")}]
version: "${preferConst.version}"
enabled: true
---
${preferConst.instructions}
`
  : "";
export const PREFER_CONST_INSTRUCTIONS = preferConst?.instructions ?? "";

function supportingFromTree(tree: Record<string, string>, prefix: string) {
  return Object.keys(tree)
    .map((path) => path.replace(/\\/g, "/"))
    .filter((path) => path.startsWith(prefix) && !path.toLowerCase().endsWith("/skill.md"))
    .map((path) => path.slice(prefix.length))
    .filter(Boolean);
}

function superpowersSkillPrefix(id: string) {
  const needle = `/skills/${id}/`;
  for (const path of Object.keys(superpowersTree)) {
    const normalized = path.replace(/\\/g, "/");
    const index = normalized.lastIndexOf(needle);
    if (index >= 0) return normalized.slice(0, index + needle.length);
  }
  return "";
}

export function listBuiltinSupporting(id: string) {
  const local = supportingFromTree(builtinTree, `./builtin/${id}/`);
  const extraPrefix = superpowersSkillPrefix(id);
  const extra = extraPrefix ? supportingFromTree(superpowersTree, extraPrefix) : [];
  return [...new Set([...local, ...extra])].sort((left, right) => left.localeCompare(right));
}

export function readBuiltinSupporting(id: string, relative: string) {
  const wanted = `./builtin/${id}/${relative}`.replace(/\\/g, "/");
  for (const [path, content] of Object.entries(builtinTree)) {
    if (path.replace(/\\/g, "/") === wanted) return content;
  }
  const prefix = superpowersSkillPrefix(id);
  if (!prefix) return null;
  const extraWanted = `${prefix}${relative}`.replace(/\\/g, "/");
  for (const [path, content] of Object.entries(superpowersTree)) {
    if (path.replace(/\\/g, "/") === extraWanted) return content;
  }
  return null;
}
