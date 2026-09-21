import { MAX_SKILL_CHARS } from "../context/budget";
import { clipText } from "../context/tokens";
import type { TaskGrantStore } from "../permissions/grants";
import type { ToolRegistry } from "../ToolRegistry";
import { normalizeSkillId } from "./ids";
import { skillDocuments } from "./SkillDocument";
import type { SkillRegistry } from "./SkillRegistry";
import type { SkillTurnSession } from "./session";
import type { SkillDefinition } from "./types";

export class SkillInvokeError extends Error {
  constructor(
    public readonly code:
      | "unknown_skill"
      | "not_user_invocable"
      | "model_invocation_disabled"
      | "skill_disabled",
    message: string,
  ) {
    super(message);
    this.name = "SkillInvokeError";
  }
}

export function parseSlashSkill(content: string): { id: string; args: string } | null {
  const match = content.match(/^\/([A-Za-z][\w.-]*)(?:\s+([\s\S]*))?$/);
  if (!match) return null;
  return { id: match[1], args: (match[2] ?? "").trim() };
}

export function renderSkill(skill: SkillDefinition, args = ""): string {
  const body = clipText(skill.instructions, MAX_SKILL_CHARS);
  const tokens = args.split(/\s+/).filter(Boolean);
  return body
    .replace(/\$ARGUMENTS\b/g, args)
    .replace(/\$(\d+)\b/g, (full, raw) => {
      const index = Number(raw);
      return Number.isInteger(index) && tokens[index] !== undefined ? tokens[index] : full;
    });
}

export function formatLoadedSkillMessage(
  skill: SkillDefinition,
  args: string,
  supportingFiles: readonly string[] = [],
): string {
  const body = renderSkill(skill, args);
  const note = formatSupportingFilesNote(supportingFiles);
  const rest = args.trim();
  if (rest) return `Skill ${skill.name} loaded.\n\n${body}${note}\n\n${rest}`;
  return `Skill ${skill.name} loaded.\n\n${body}${note}`;
}

export function formatSupportingFilesNote(files: readonly string[]) {
  if (files.length === 0) return "";
  return `\n\nSupporting files — call load_skill with file=… to read them: ${files.join(", ")}`;
}

export function assertUserMayInvoke(skill: SkillDefinition) {
  if (!skill.userInvocable) {
    throw new SkillInvokeError("not_user_invocable", `Skill "${skill.id}" is not user-invocable.`);
  }
}

export function assertModelMayLoad(skill: SkillDefinition, userInvokedIds: readonly string[]) {
  if (!skill.disableModelInvocation) return;
  const allowed = userInvokedIds.some((id) => normalizeSkillId(id) === normalizeSkillId(skill.id));
  if (!allowed) {
    throw new SkillInvokeError(
      "model_invocation_disabled",
      `Skill "${skill.id}" cannot be loaded by the model.`,
    );
  }
}

export function applySkillToolGrants(
  skill: SkillDefinition,
  grants: TaskGrantStore,
  registry: ToolRegistry,
) {
  for (const name of skill.allowedTools) {
    const tool = registry.get(name);
    if (!tool) continue;
    grants.add({
      id: `skill:${skill.id}:${name}`,
      capability: tool.capability,
      scope: { kind: "tools", names: [name] },
      duration: "task",
      tool: name,
    });
  }
}

export function recordSkillInvocation(
  session: SkillTurnSession,
  skill: SkillDefinition,
  reason: string,
) {
  if (!session.invoked.some((item) => item.id === skill.id)) {
    session.invoked.push(skill);
  }
  session.workflow?.markSkillCheck(skill.id);
  session.emit?.({
    type: "skill-selected",
    skillId: skill.id,
    name: skill.name,
    reason,
    version: skill.version,
  });
  session.emit?.({ type: "skill-loaded", skillId: skill.id, name: skill.name });
}

export function invokedModelPin(invoked: readonly SkillDefinition[]): string | undefined {
  const preferred = unique(
    invoked
      .map((skill) => skill.modelPreference)
      .filter((value): value is string => Boolean(value)),
  );
  return invoked.length === 1 && preferred.length === 1 ? preferred[0] : undefined;
}

export async function tryApplySlashSkill(
  content: string,
  registry: SkillRegistry,
  session: SkillTurnSession,
  tools: ToolRegistry,
  includeProject: boolean,
): Promise<string> {
  const slash = parseSlashSkill(content);
  if (!slash) return content;
  const skill = await registry.resolve(slash.id, { includeProject });
  if (!skill || !registry.isAvailable(skill)) return content;
  try {
    assertUserMayInvoke(skill);
  } catch {
    return content;
  }
  if (!session.userInvokedIds.includes(skill.id)) {
    session.userInvokedIds.push(skill.id);
  }
  applySkillToolGrants(skill, session.grants, tools);
  recordSkillInvocation(session, skill, `Invoked with /${skill.id}`);
  const supportingFiles = await skillDocuments.listSupporting(skill.origin, skill.id).catch(() => []);
  return formatLoadedSkillMessage(skill, slash.args, supportingFiles);
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}
