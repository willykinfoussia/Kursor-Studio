import { describe, expect, it } from "vitest";
import { parseSkill } from "../parseSkill";
import {
  SkillDocumentError,
  SkillDocumentService,
  serializeSkill,
  shadowsBuiltin,
  splitSkillList,
  type ProjectSkillFiles,
  type UserSkillFiles,
} from "../SkillDocument";

function memoryProject(open = true): ProjectSkillFiles & { files: Map<string, string> } {
  const files = new Map<string, string>();
  return {
    files,
    hasProject: () => open,
    readFile: async (path) => {
      if (!files.has(path)) throw new Error(`missing ${path}`);
      return files.get(path) ?? "";
    },
    writeFile: async (path, content) => {
      files.set(path, content);
    },
    createDirectory: async () => undefined,
    delete: async (path) => {
      for (const key of [...files.keys()]) {
        if (key === path || key.startsWith(`${path}/`)) files.delete(key);
      }
    },
    listFiles: async (directory) => {
      const prefix = `${directory.replace(/\\/g, "/").replace(/\/$/, "")}/`;
      return [...files.keys()].filter((path) => path.replace(/\\/g, "/").startsWith(prefix));
    },
  };
}

function memoryUser(): UserSkillFiles & { files: Map<string, string> } {
  const files = new Map<string, string>();
  return {
    files,
    read: async (relative) => {
      if (!files.has(relative)) throw new Error(`missing ${relative}`);
      return files.get(relative) ?? "";
    },
    write: async (relative, content) => {
      files.set(relative, content);
    },
    delete: async (relative) => {
      for (const key of [...files.keys()]) {
        if (key === relative || key.startsWith(`${relative}/`)) files.delete(key);
      }
    },
    listFiles: async (directory) => {
      const prefix = `${directory.replace(/\\/g, "/").replace(/\/$/, "")}/`;
      return [...files.keys()].filter((path) => path.replace(/\\/g, "/").startsWith(prefix));
    },
  };
}

describe("SkillDocument", () => {
  it("roundtrips serializeSkill through parseSkill", () => {
    const raw = serializeSkill({
      id: "search-first",
      name: "Search first",
      description: "Use before writing a helper",
      triggers: ["search", "library"],
      allowedTools: ["read_file", "search_files"],
      instructions: "Search the repo first.",
    });
    const parsed = parseSkill(raw, "search-first", "project");
    expect(parsed).toMatchObject({
      id: "search-first",
      name: "Search first",
      description: "Use before writing a helper",
      triggers: ["search", "library"],
      allowedTools: ["read_file", "search_files"],
      instructions: "Search the repo first.",
      origin: "project",
    });

    const quoted = serializeSkill({
      id: "quoted-skill",
      name: "Need: quotes",
      description: "Use when: the helper exists",
      instructions: "Do the thing.",
    });
    expect(quoted).toContain('"Need: quotes"');
    expect(parseSkill(quoted, "quoted-skill", "project")).toMatchObject({
      name: "Need: quotes",
      description: "Use when: the helper exists",
    });
  });

  it("creates, updates, and deletes a project skill", async () => {
    const project = memoryProject();
    const docs = new SkillDocumentService({ project, builtins: () => [{ id: "prefer-const" }] });
    await docs.create("project", {
      id: "team-review",
      name: "Team review",
      description: "Review diffs",
      instructions: "Read the diff.",
    });
    expect(project.files.get(".kursor/skills/team-review/SKILL.md")).toContain("Team review");
    await expect(docs.read("project", "team-review")).resolves.toMatchObject({
      id: "team-review",
      instructions: "Read the diff.",
    });
    await docs.update("project", {
      id: "team-review",
      name: "Team review",
      description: "Review diffs",
      instructions: "Read git_diff.",
    });
    expect(project.files.get(".kursor/skills/team-review/SKILL.md")).toContain("Read git_diff.");
    await docs.remove("project", "team-review");
    expect(project.files.size).toBe(0);
  });

  it("creates and deletes a user skill", async () => {
    const user = memoryUser();
    const docs = new SkillDocumentService({
      project: memoryProject(),
      user,
      builtins: () => [],
    });
    await docs.create("user", { id: "my-prefs", instructions: "Prefer tabs." });
    expect(user.files.get("my-prefs/SKILL.md")).toContain("Prefer tabs.");
    await docs.remove("user", "my-prefs");
    expect(user.files.size).toBe(0);
  });

  it("refuses an invalid id, a missing project, duplicates, and missing updates", async () => {
    const closed = memoryProject(false);
    const docs = new SkillDocumentService({ project: closed, user: memoryUser(), builtins: () => [{ id: "prefer-const" }] });
    await expect(docs.create("project", { id: "ok-skill", instructions: "x" })).rejects.toMatchObject({ code: "no_project" });
    expect(() => serializeSkill({ id: "1bad" })).toThrow(SkillDocumentError);
    const open = memoryProject();
    const writable = new SkillDocumentService({ project: open, user: memoryUser(), builtins: () => [] });
    await writable.create("project", { id: "dup", instructions: "one" });
    await expect(writable.create("project", { id: "dup", instructions: "two" })).rejects.toMatchObject({ code: "already_exists" });
    await expect(writable.update("project", { id: "missing", instructions: "nope" })).rejects.toMatchObject({ code: "not_found" });
  });

  it("detects builtin shadowing and splits comma lists", () => {
    expect(shadowsBuiltin("prefer-const", [{ id: "prefer-const" }])).toBe(true);
    expect(shadowsBuiltin("other", [{ id: "prefer-const" }])).toBe(false);
    expect(splitSkillList("read_file, apply_patch; search_files")).toEqual([
      "read_file",
      "apply_patch",
      "search_files",
    ]);
  });

  it("writes and rereads supporting files for project and user skills", async () => {
    const project = memoryProject();
    const user = memoryUser();
    const docs = new SkillDocumentService({ project, user, builtins: () => [] });
    await docs.create("project", {
      id: "tdd",
      instructions: "See tests.md",
      files: [{ path: "tests.md", content: "Write the failing test first." }],
    });
    expect(project.files.get(".kursor/skills/tdd/tests.md")).toBe("Write the failing test first.");
    await expect(docs.read("project", "tdd")).resolves.toMatchObject({
      files: [{ path: "tests.md", content: "Write the failing test first." }],
    });
    await expect(docs.listSupporting("project", "tdd")).resolves.toEqual(["tests.md"]);
    await docs.update("project", {
      id: "tdd",
      instructions: "See tests.md",
      files: [{ path: "mocking.md", content: "Mock system boundaries." }],
    });
    expect(project.files.has(".kursor/skills/tdd/tests.md")).toBe(false);
    expect(project.files.get(".kursor/skills/tdd/mocking.md")).toContain("Mock system");

    await docs.create("user", {
      id: "tdd",
      instructions: "User copy",
      files: [{ path: "scripts/loop.sh", content: "echo red" }],
    });
    expect(user.files.get("tdd/scripts/loop.sh")).toBe("echo red");
    await expect(docs.readSupporting("user", "tdd", "scripts/loop.sh")).resolves.toBe("echo red");
  });

  it("refuses a supporting path that escapes the skill folder", async () => {
    const docs = new SkillDocumentService({ project: memoryProject(), user: memoryUser(), builtins: () => [] });
    await docs.create("project", { id: "safe", instructions: "ok" });
    await expect(docs.readSupporting("project", "safe", "../secrets")).rejects.toMatchObject({ code: "invalid_path" });
  });
});
