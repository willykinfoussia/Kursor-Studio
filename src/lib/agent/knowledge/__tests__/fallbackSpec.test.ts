import { describe, expect, it } from "vitest";
import { withFallbackProductSpec } from "../fallbackSpec";

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
  "src/auth.ts owns issue, rotation, and revocation.",
  "",
  "## Decisions",
  "Refresh tokens are rotated on every use so a stolen token cannot be replayed.",
].join("\n");

describe("withFallbackProductSpec", () => {
  it("keeps a substantial spec", () => {
    const parsed = {
      summary: "Auth",
      skillActions: [],
      specActions: [{
        id: "spec:0:auth.md",
        action: "create" as const,
        scope: "project" as const,
        rationale: "Auth constraints",
        fileName: "auth.md",
        content: architecture,
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

  it("injects one architecture spec after product files change", () => {
    const next = withFallbackProductSpec(
      { summary: "", skillActions: [], specActions: [] },
      { goal: "Football pages", filesChanged: ["src/pages/Football.tsx", ".kursor/plans/x.plan.md"] },
    );
    expect(next.specActions).toHaveLength(1);
    expect(next.specActions[0]).toMatchObject({
      action: "create",
      kind: "architecture",
      fileName: "football-pages.md",
    });
    const content = next.specActions[0]?.content ?? "";
    expect(content).toContain("## Intention");
    expect(content).toContain("## Architecture");
    expect(content).toContain("## Structure");
    expect(content).toContain("type: architecture");
    expect(content).toContain("src/pages/Football.tsx");
    expect(content).not.toContain(".kursor/plans");
    expect(content).not.toContain("Files touched");
  });

  it("replaces a file list with an architecture spec", () => {
    const next = withFallbackProductSpec({
      summary: "ui",
      skillActions: [],
      specActions: [{
        id: "spec:0:ui.md",
        action: "create" as const,
        scope: "project" as const,
        kind: "documentation",
        fileName: "ui.md",
        rationale: "thin",
        content: "# améliore l'UI du site\n\nFiles touched:\n- frontend/src/App.tsx",
      }],
    }, {
      goal: "améliore l'UI du site",
      filesChanged: ["frontend/src/App.tsx", "frontend/src/index.css"],
    });
    expect(next.specActions).toHaveLength(1);
    const content = next.specActions[0]?.content ?? "";
    expect(content).toContain("## Intention");
    expect(content).toContain("## Architecture");
    expect(content).toContain("## Structure");
    expect(content).toContain("## Décisions");
    expect(content).toContain("frontend/src/App.tsx");
    expect(content).toContain("frontend/src/index.css");
    expect(content).toContain("Composant d'interface App");
    expect(content).not.toContain("Files touched");
    expect(next.specActions[0]).toMatchObject({ fileName: "ui.md", kind: "architecture" });
  });
});
