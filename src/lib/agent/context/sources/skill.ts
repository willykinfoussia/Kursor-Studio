import { CONTEXT_PRIORITIES, type ContextSource, type SourceCollectResult } from "../types";
import { estimateTokens } from "../tokens";
import { SkillRegistry } from "../../skills/SkillRegistry";
import type { SkillListingItem } from "../../skills/types";

export class SkillSource implements ContextSource {
  readonly id = "skill" as const;

  constructor(private readonly registry: SkillRegistry) {}

  async collect(snapshot: Parameters<ContextSource["collect"]>[0]): Promise<SourceCollectResult> {
    try {
      const listed = await this.registry.listForPrompt(snapshot.request, {
        includeProject: Boolean(snapshot.project),
      });
      if (listed.length === 0) {
        return { slices: [], skipReason: "no skills" };
      }
      const text = formatSkillListing(listed);
      return {
        slices: [{
          id: "skill:catalog",
          source: this.id,
          priority: CONTEXT_PRIORITIES.projectRules,
          score: Math.max(...listed.map((item) => item.score), 0.1),
          tokens: estimateTokens(text),
          text,
          meta: {
            kind: "listing",
            ids: listed.map((item) => item.skill.id).join(","),
            names: listed.map((item) => item.skill.name).join(","),
          },
        }],
      };
    } catch {
      return { slices: [], skipReason: "skill discovery failed" };
    }
  }
}

function formatSkillListing(listed: readonly SkillListingItem[]): string {
  const lines = listed.map((item) => {
    if (!item.detail) return `- ${item.skill.id}`;
    const description = item.skill.description.trim();
    return description
      ? `- ${item.skill.id}: ${description}`
      : `- ${item.skill.id}`;
  });
  return [
    "Available skills (name + description). Check for a relevant skill before any action (1% rule). Load one with load_skill. Use check_skills if none apply. The user may type /id to load a skill.",
    ...lines,
  ].join("\n");
}
