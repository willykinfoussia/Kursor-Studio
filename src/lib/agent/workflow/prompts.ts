import { BUILTIN_SKILLS, readBuiltinSupporting } from "../skills/parseSkill";

const PREFIX = "<using-superpowers>";
const SUFFIX = "</using-superpowers>";

const agentPromptTree = import.meta.glob("../agents/prompts/*.md", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

function readAgentPrompt(fileName: string) {
  const wanted = fileName.replace(/\\/g, "/").toLowerCase();
  for (const [path, content] of Object.entries(agentPromptTree)) {
    if (path.replace(/\\/g, "/").toLowerCase().endsWith(`/${wanted}`)) return content;
  }
  return "";
}

export function usingSuperpowersBody(): string {
  const skill = BUILTIN_SKILLS.find((item) => item.id === "using-superpowers");
  return skill?.instructions?.trim() ?? "";
}

export function wrapUsingSuperpowers(body = usingSuperpowersBody()): string {
  if (!body) return "";
  const mapping = readBuiltinSupporting("using-superpowers", "references/kursor-tools.md")?.trim() ?? "";
  const mapped = mapping ? `${body}\n\n${mapping}` : body;
  return `${PREFIX}\n${mapped}\n${SUFFIX}`;
}

export function specialistSkillPrompt(id: string, invokedSkillIds: readonly string[] = []): string {
  if (id === "implement") {
    return readAgentPrompt("implementer-prompt.md").trim();
  }
  if (id === "explore") {
    if (invokedSkillIds.includes("subagent-driven-planning")) {
      return readBuiltinSupporting("subagent-driven-planning", "explore-prompt.md")?.trim() ?? "";
    }
    if (invokedSkillIds.includes("subagent-driven-brainstorming")) {
      return readBuiltinSupporting("subagent-driven-brainstorming", "explore-prompt.md")?.trim() ?? "";
    }
  }
  return "";
}

export function hasUsingSuperpowers(text: string) {
  return text.includes(PREFIX);
}

export function ensureUsingSuperpowers(systemPrompt: string, injectSubagent: boolean): string {
  if (injectSubagent) return systemPrompt;
  const body = wrapUsingSuperpowers();
  if (!body) return systemPrompt;
  if (hasUsingSuperpowers(systemPrompt)) return systemPrompt;
  return `${body}\n\n${systemPrompt}`;
}

export const COMPACT_SYSTEM = `Summarize the conversation for a coding agent so work can continue.
Preserve: user goal, designApproved/plan path, designNotes/designBrief, files touched, decisions, open review findings, agent branch name and base.
Do not invent tool results. No mutating instructions.`;
