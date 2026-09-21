const SKILL_ID_ALIASES: Record<string, string> = {
  brainstorm: "brainstorming",
};

export function normalizeSkillId(id: string): string {
  const stripped = id
    .trim()
    .toLowerCase()
    .replace(/^skill:/, "")
    .replace(/^superpowers[/:]/, "")
    .replace(/^(builtin|project|user|global)\.skill\./, "");
  return SKILL_ID_ALIASES[stripped] ?? stripped;
}
