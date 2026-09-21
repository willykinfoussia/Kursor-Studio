import { describe, expect, it } from "vitest";
import { extractJsonObject, hasKnowledgeActions, parseKnowledgeReflectResult } from "../schema";

describe("parseKnowledgeReflectResult", () => {
  it("parses fenced JSON and drops none / invalid actions", () => {
    const raw = `Sure.
\`\`\`json
{
  "summary": "Capture the auth flow",
  "skillActions": [
    { "action": "none" },
    {
      "action": "create",
      "skillId": "Search First",
      "scope": "project",
      "rationale": "Reusable search procedure",
      "draft": { "name": "Search first", "description": "Use when searching", "triggers": ["search"], "instructions": "Search before writing." }
    }
  ],
  "specActions": [
    { "action": "delete" },
    { "action": "update", "scope": "account", "path": "account/specs/auth.md", "rationale": "Record JWT constraint", "content": "Use refresh tokens." }
  ]
}
\`\`\``;
    const parsed = parseKnowledgeReflectResult(raw);
    expect(parsed.summary).toBe("Capture the auth flow");
    expect(parsed.skillActions).toHaveLength(1);
    expect(parsed.skillActions[0]).toMatchObject({
      action: "create",
      skillId: "search-first",
      scope: "project",
    });
    expect(parsed.specActions).toHaveLength(1);
    expect(parsed.specActions[0]).toMatchObject({
      action: "update",
      scope: "account",
      path: "account/specs/auth.md",
    });
    expect(hasKnowledgeActions(parsed)).toBe(true);
  });

  it("accepts a spec create with kind and rationale but no fileName", () => {
    const parsed = parseKnowledgeReflectResult({
      summary: "Football pages",
      skillActions: [],
      specActions: [{
        action: "create",
        scope: "project",
        kind: "documentation",
        rationale: "Mirror basketball management for football",
      }],
    });
    expect(parsed.specActions).toHaveLength(1);
    expect(parsed.specActions[0]).toMatchObject({
      action: "create",
      kind: "documentation",
      fileName: "mirror-basketball-management-for-football.md",
    });
  });

  it("returns empty arrays for invalid payloads", () => {
    expect(parseKnowledgeReflectResult("not json")).toEqual({
      summary: "",
      skillActions: [],
      specActions: [],
    });
    expect(extractJsonObject("no object here")).toBeNull();
    expect(hasKnowledgeActions({ summary: "noop", skillActions: [], specActions: [] })).toBe(false);
  });
});
