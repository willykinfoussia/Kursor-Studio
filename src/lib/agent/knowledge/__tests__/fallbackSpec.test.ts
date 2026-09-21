import { describe, expect, it } from "vitest";
import { withFallbackProductSpec } from "../fallbackSpec";

describe("withFallbackProductSpec", () => {
  it("keeps LLM spec actions", () => {
    const parsed = {
      summary: "Auth",
      skillActions: [],
      specActions: [{
        id: "spec:0:auth.md",
        action: "create" as const,
        scope: "project" as const,
        rationale: "Auth constraints",
        fileName: "auth.md",
      }],
    };
    expect(withFallbackProductSpec(parsed, {
      goal: "add auth",
      filesChanged: ["src/auth.ts"],
    })).toBe(parsed);
  });

  it("does not invent a spec while the plan is unfinished", () => {
    const parsed = { summary: "", skillActions: [], specActions: [] };
    expect(withFallbackProductSpec(parsed, {
      goal: "add football pages",
      filesChanged: ["src/pages/Football.tsx"],
      planUnfinished: true,
    }).specActions).toEqual([]);
  });

  it("injects one documentation spec after product files change", () => {
    const next = withFallbackProductSpec(
      { summary: "", skillActions: [], specActions: [] },
      { goal: "Football pages", filesChanged: ["src/pages/Football.tsx", ".kursor/plans/x.plan.md"] },
    );
    expect(next.specActions).toHaveLength(1);
    expect(next.specActions[0]).toMatchObject({
      action: "create",
      kind: "documentation",
      fileName: "football-pages.md",
    });
    expect(next.specActions[0]?.content).toContain("src/pages/Football.tsx");
    expect(next.specActions[0]?.content).not.toContain(".kursor/plans");
  });
});
