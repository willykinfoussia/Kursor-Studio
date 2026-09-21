import { describe, expect, it } from "vitest";
import { shouldSkipKnowledgeReflect } from "../gates";

const base = {
  enabled: true,
  alreadyRunning: false,
  messages: [
    { role: "user", content: "Implement JWT auth with refresh tokens" },
    { role: "assistant", content: "Wrote the auth module." },
  ],
  toolNames: ["write_file"],
  filesChanged: ["src/auth.ts"],
  goal: "Implement JWT auth with refresh tokens",
};

describe("shouldSkipKnowledgeReflect", () => {
  it("skips when disabled, reflector turn, or already running", () => {
    expect(shouldSkipKnowledgeReflect({ ...base, enabled: false })).toEqual({ skip: true, reason: "disabled" });
    expect(shouldSkipKnowledgeReflect({ ...base, skipFlag: true })).toEqual({ skip: true, reason: "reflect-turn" });
    expect(shouldSkipKnowledgeReflect({ ...base, alreadyRunning: true })).toEqual({ skip: true, reason: "in-flight" });
  });

  it("skips brainstorming and plan-only writes", () => {
    expect(shouldSkipKnowledgeReflect({
      ...base,
      toolNames: ["read_file"],
      filesChanged: [],
      goal: "Design a settings page and profile flow",
    })).toEqual({ skip: true, reason: "not-implementation" });
    expect(shouldSkipKnowledgeReflect({
      ...base,
      toolNames: ["create_plan"],
      filesChanged: [".kursor/plans/iaeat-v2.plan.md"],
    })).toEqual({ skip: true, reason: "not-implementation" });
  });

  it("skips when there are fewer than two useful messages", () => {
    expect(shouldSkipKnowledgeReflect({
      ...base,
      messages: [{ role: "user", content: "Implement JWT auth with refresh tokens" }],
    })).toEqual({ skip: true, reason: "trivial" });
  });

  it("skips mid-plan implementation while todos remain", () => {
    expect(shouldSkipKnowledgeReflect({
      ...base,
      planUnfinished: true,
    })).toEqual({ skip: true, reason: "not-implementation" });
  });

  it("runs after product files change and the plan is finished", () => {
    expect(shouldSkipKnowledgeReflect({
      ...base,
      goal: "add auth",
      planUnfinished: false,
    })).toEqual({ skip: false });
  });
});
