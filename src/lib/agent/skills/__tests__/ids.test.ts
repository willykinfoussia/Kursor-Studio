import { describe, expect, it } from "vitest";
import { normalizeSkillId } from "../ids";

describe("normalizeSkillId", () => {
  it("strips superpowers prefixes and aliases brainstorm", () => {
    expect(normalizeSkillId("superpowers:brainstorming")).toBe("brainstorming");
    expect(normalizeSkillId("superpowers/brainstorming")).toBe("brainstorming");
    expect(normalizeSkillId("brainstorm")).toBe("brainstorming");
    expect(normalizeSkillId("skill:brainstorming")).toBe("brainstorming");
    expect(normalizeSkillId("writing-plans")).toBe("writing-plans");
  });
});
