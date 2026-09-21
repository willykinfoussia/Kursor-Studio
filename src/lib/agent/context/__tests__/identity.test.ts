import { describe, expect, it } from "vitest";
import { toolGuidance } from "../identity";

describe("toolGuidance", () => {
  it("requires writing-plans before create_plan and executing-plans during Build", () => {
    const text = toolGuidance(true, true);
    expect(text).toMatch(/MUST load_skill writing-plans/);
    expect(text).toMatch(/MUST load_skill executing-plans/);
    expect(text).toMatch(/MUST load_skill test-driven-development/);
    expect(text).toMatch(/MUST load_skill verification-before-completion/);
    expect(text).toMatch(/MUST load_skill using-kursor-shell/);
    expect(text).toMatch(/yes\/oui/);
    expect(text).toMatch(/not ok or d'accord/);
    expect(text).toMatch(/Mention Build only after create_plan returned success and wrote a file/);
    expect(text).toMatch(/If create_plan returns success false/);
    expect(text).toMatch(/section per todo/);
    expect(text).toMatch(/Outline-only/);
    expect(text).toMatch(/KEEP\/EXTEND/);
    expect(text).toMatch(/6000/);
    expect(text).toMatch(/remain pending or in_progress/);
    expect(text).toMatch(/After completing a todo, start the next one immediately/);
    expect(text).toMatch(/git_commit then git_push if origin exists, then git_branch creates an implementation branch/);
    expect(text).toMatch(/Do not stash/);
    expect(text).toMatch(/Do not create \.worktrees\//);
    expect(text).toMatch(/do not invent a different stack/);
    expect(text).toMatch(/at least two explore subagents/);
    expect(text).toMatch(/finish_development_branch/);
  });
});
