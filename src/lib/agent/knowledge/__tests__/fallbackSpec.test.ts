import { describe, expect, it } from "vitest";
import { graphTokens } from "../../../graph/tokenize";
import { bindSkillCreates, bindSpecCreates } from "../matchCatalog";
import { reconcileKnowledge } from "../reconcile";
import { isSubstantialSpec } from "../specDocument";
import type { SkillProposalAction, SpecProposalAction } from "../types";

const architecture = [
  "# Auth",
  "",
  "## Intention",
  "Sessions stay valid without asking for the password on every request.",
  "",
  "## Architecture",
  "The client keeps a short-lived access token and rotates a refresh token.",
  "",
  "## Structure",
  "The auth module owns issue, rotation, and revocation of refresh tokens.",
  "",
  "## Decisions",
  "Refresh tokens are rotated on every use so a stolen token cannot be replayed.",
  "",
  "## Fichiers",
  "- `src/auth.ts` — issues and rotates refresh tokens.",
].join("\n");

function specAction(content: string, fileName = "auth.md"): SpecProposalAction {
  return {
    id: "spec:0:auth.md",
    action: "create",
    scope: "project",
    rationale: "Auth constraints",
    fileName,
    content,
  };
}

const reusableSkill: SkillProposalAction = {
  id: "skill:0:search-first",
  action: "create",
  skillId: "search-first",
  scope: "project",
  rationale: "Reusable search",
  draft: {
    name: "Search first",
    description: "Use when searching a repository before writing a helper",
    triggers: ["search"],
    instructions: [
      "- Search the repository for an existing helper before adding one.",
      "- Extend that helper when it already covers the case.",
    ].join("\n"),
  },
};

describe("knowledge quality", () => {
  it("keeps a spec that describes the system in five sections", () => {
    expect(isSubstantialSpec(architecture)).toBe(true);
    const parsed = {
      summary: "Auth",
      skillActions: [],
      specActions: [specAction(architecture)],
    };
    expect(reconcileKnowledge(parsed, [], { goal: "add auth", filesChanged: ["src/auth.ts"] }, "full")).toEqual(parsed);
  });

  it("rejects a file list and the generated skeleton phrases", () => {
    expect(isSubstantialSpec("# UI\n\nFiles touched:\n- frontend/src/App.tsx")).toBe(false);
    const skeleton = architecture.replace(
      "The client keeps a short-lived access token and rotates a refresh token.",
      "These modules carry the intention above.",
    );
    expect(isSubstantialSpec(skeleton)).toBe(false);
    const next = reconcileKnowledge({
      summary: "ui",
      skillActions: [],
      specActions: [specAction("# UI\n\nFiles touched:\n- frontend/src/App.tsx", "ui.md")],
    }, [], { goal: "améliore l'UI du site", filesChanged: ["frontend/src/App.tsx"] }, "full");
    expect(next.specActions).toEqual([]);
  });

  it("drops specs in skills mode and keeps a reusable procedure", () => {
    const next = reconcileKnowledge({
      summary: "Search",
      skillActions: [reusableSkill],
      specActions: [specAction(architecture)],
    }, [], { goal: "how should we search", filesChanged: [] }, "skills");
    expect(next.specActions).toEqual([]);
    expect(next.skillActions).toHaveLength(1);
  });

  it("drops a one-line skill", () => {
    const next = reconcileKnowledge({
      summary: "thin",
      skillActions: [{
        ...reusableSkill,
        draft: { ...reusableSkill.draft!, description: "Use when searching", instructions: "Search first." },
      }],
      specActions: [],
    }, [], { goal: "search", filesChanged: [] }, "skills");
    expect(next.skillActions).toEqual([]);
  });

  it("turns a create into an update of the matching spec and keeps one", () => {
    const catalog = [{
      id: ".kursor/specs/project/technical/auth.md",
      kind: "spec" as const,
      path: ".kursor/specs/project/technical/auth.md",
      scope: "project",
      title: "Auth",
      tokens: ["auth", "refresh", "token"],
    }];
    const second = specAction(architecture, "notes.md");
    second.id = "spec:1:notes.md";
    const bound = bindSpecCreates([specAction(architecture, "notes.md"), second], catalog);
    expect(bound).toHaveLength(1);
    expect(bound[0]).toMatchObject({
      action: "update",
      path: ".kursor/specs/project/technical/auth.md",
    });
  });

  it("updates a skill with the same id and drops a description that repeats another skill", () => {
    const existing = "Use when searching the repository index before writing a helper";
    const catalog = [{
      id: "search-first",
      kind: "skill" as const,
      description: existing,
      tokens: graphTokens(`search-first ${existing}`),
    }];
    const sameId = bindSkillCreates([reusableSkill], catalog);
    expect(sameId[0]?.action).toBe("update");
    const overlap = bindSkillCreates([{
      ...reusableSkill,
      id: "skill:0:repo-search",
      skillId: "repo-search",
      draft: {
        ...reusableSkill.draft!,
        description: "Use when searching the repository index before writing a helper module",
      },
    }], catalog);
    expect(overlap).toEqual([]);
  });
});
