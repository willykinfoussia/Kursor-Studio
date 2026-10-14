import { describe, expect, it } from "vitest";
import { CODING_AGENT_RULES, toolGuidance } from "../identity";
import { estimateTokens } from "../tokens";
import type { ContextSlice } from "../types";
import { buildContextUsage, formatContextTokens } from "../usage";

function slice(partial: Partial<ContextSlice> & Pick<ContextSlice, "id" | "source" | "text">): ContextSlice {
  return {
    priority: 1,
    score: 1,
    tokens: partial.tokens ?? estimateTokens(partial.text),
    ...partial,
  };
}

describe("buildContextUsage", () => {
  it("groups the reserved system prompt and kept slices in prompt order", () => {
    const longText = "x".repeat(5000);
    const usage = buildContextUsage({
      toolsEnabled: true,
      hasProject: true,
      maxTokens: 1500,
      slices: [
        slice({ id: "conversation:0", source: "conversation", text: "fix login", meta: { role: "user" } }),
        slice({ id: "rule:project:KURSOR.md", source: "rule", text: "Project rule", meta: { path: "KURSOR.md" } }),
        slice({ id: "skill:catalog", source: "skill", text: longText, tokens: 12, meta: { names: "tdd, review" } }),
        slice({ id: "rag:empty", source: "rag", text: "", tokens: 0 }),
      ],
    });

    expect(usage.groups.map((group) => group.label)).toEqual([
      "System prompt",
      "Skills",
      "Rules",
      "Conversation",
    ]);
    expect(usage.maxTokens).toBe(1500);
    const systemTokens = estimateTokens(`${CODING_AGENT_RULES}\n\n${toolGuidance(true, true)}`);
    expect(usage.groups[0]?.tokens).toBe(systemTokens);
    expect(usage.groups[0]?.items[0]?.text).toContain(CODING_AGENT_RULES);
    expect(usage.groups[1]?.items[0]).toMatchObject({
      label: "tdd, review",
      tokens: 12,
      text: longText,
    });
    expect(usage.groups[2]?.items[0]?.label).toBe("KURSOR.md");
    expect(usage.groups[3]?.items[0]?.label).toBe("User");
    expect(usage.tokensUsed).toBe(
      systemTokens
      + 12
      + estimateTokens("Project rule")
      + estimateTokens("fix login"),
    );
  });
});

describe("formatContextTokens", () => {
  it("keeps small counts and shortens thousands", () => {
    expect(formatContextTokens(0)).toBe("0");
    expect(formatContextTokens(860)).toBe("860");
    expect(formatContextTokens(1800)).toBe("1.8K");
    expect(formatContextTokens(50700)).toBe("50.7K");
  });
});
