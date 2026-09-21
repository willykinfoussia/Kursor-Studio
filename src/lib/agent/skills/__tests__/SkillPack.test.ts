import { describe, expect, it } from "vitest";
import { discoverSkillPacks, packToDraft } from "../SkillPack";

describe("SkillPack", () => {
  it("discovers SKILL.md plus supporting markdown in the same folder", () => {
    const packs = discoverSkillPacks([
      {
        path: "tdd/SKILL.md",
        content: `---
name: tdd
description: Test-driven development
triggers: [red-green]
---
See [tests.md](tests.md).
`,
      },
      { path: "tdd/tests.md", content: "Write the failing test first." },
      { path: "tdd/mocking.md", content: "Mock system boundaries." },
      { path: "tdd/agents/openai.yaml", content: "ignored" },
      { path: "tdd/icon.png", content: "binary" },
    ]);
    expect(packs).toHaveLength(1);
    expect(packs[0]).toMatchObject({
      id: "tdd",
      files: [
        { path: "mocking.md", content: "Mock system boundaries." },
        { path: "tests.md", content: "Write the failing test first." },
      ],
    });
    expect(packToDraft(packs[0]!)).toMatchObject({
      id: "tdd",
      name: "tdd",
      description: "Test-driven development",
      triggers: ["red-green"],
      instructions: "See [tests.md](tests.md).",
    });
  });

  it("uses the picked folder name when SKILL.md is at the root", () => {
    const packs = discoverSkillPacks([
      { path: "SKILL.md", content: "---\nname: tdd\n---\nBody" },
      { path: "tests.md", content: "tests" },
    ], { rootName: "tdd" });
    expect(packs).toEqual([
      {
        id: "tdd",
        skillMd: "---\nname: tdd\n---\nBody",
        files: [{ path: "tests.md", content: "tests" }],
      },
    ]);
  });

  it("imports a pack of several skills without mixing their files", () => {
    const packs = discoverSkillPacks([
      { path: "engineering/tdd/SKILL.md", content: "---\nname: tdd\n---\nTDD" },
      { path: "engineering/tdd/tests.md", content: "tests" },
      { path: "engineering/prototype/SKILL.md", content: "---\nname: prototype\n---\nProto" },
      { path: "engineering/prototype/UI.md", content: "ui" },
      { path: "engineering/prototype/LOGIC.md", content: "logic" },
    ]);
    expect(packs.map((pack) => pack.id)).toEqual(["prototype", "tdd"]);
    expect(packs.find((pack) => pack.id === "tdd")?.files).toEqual([{ path: "tests.md", content: "tests" }]);
    expect(packs.find((pack) => pack.id === "prototype")?.files.map((file) => file.path).sort()).toEqual([
      "LOGIC.md",
      "UI.md",
    ]);
  });
});
