import { describe, expect, it } from "vitest";
import { ContextEngine } from "../../context/ContextEngine";
import type { ContextFileStore } from "../../context/types";
import type { AgentMessage } from "../../types";
import { parseSkill, PREFER_CONST_INSTRUCTIONS, PREFER_CONST_SKILL_MD, BUILTIN_SKILLS } from "../parseSkill";
import { SkillRegistry, SKILL_LISTING_DETAIL_TOP, SKILL_LISTING_FULL_THRESHOLD } from "../SkillRegistry";
import { tryApplySlashSkill } from "../invokeSkill";
import { createSkillTurnSession } from "../session";
import { TaskGrantStore } from "../../permissions/grants";
import { ToolRegistry } from "../../ToolRegistry";

function message(id: string, role: AgentMessage["role"], content: string): AgentMessage {
  return { id, role, content, timestamp: 1 };
}

function snapshot(request: string) {
  return {
    request,
    messages: [message("u1", "user", request)],
    project: { id: "p1", name: "App", rootPath: "C:/Projects/App" },
    currentFile: null,
    openFiles: [],
    toolCalls: [],
    webDocuments: [],
    activeTask: null,
    maxContextChars: 50_000,
  };
}

class MemoryFiles implements ContextFileStore {
  constructor(
    private readonly files: Record<string, string> = {},
    private readonly dirs: Record<string, { name: string; path: string; kind: "file" | "directory" }[]> = {},
  ) {}

  async readFile(path: string) {
    if (!(path in this.files)) throw new Error(`missing ${path}`);
    return this.files[path] ?? "";
  }

  async listDirectory(path: string) {
    return this.dirs[path] ?? [];
  }
}

function engineFor(skills: SkillRegistry, files?: ContextFileStore) {
  return new ContextEngine({
    skills,
    files: files ?? new MemoryFiles(),
    retrievers: { memories: async () => [], rag: async () => [] },
    git: { status: async () => ({ branch: "main", changedFiles: [], clean: true }), diff: async () => ({ diff: "" }) },
  });
}

function preferConstOnly() {
  return [parseSkill(PREFER_CONST_SKILL_MD, "prefer-const", "builtin")];
}

describe("SkillRegistry prefer-const", () => {
  it("lists the prefer-const description without injecting the body", async () => {
    const skills = new SkillRegistry({ builtins: preferConstOnly(), files: new MemoryFiles() });
    const assembled = await engineFor(skills).build(snapshot("hello there"), { budget: { maxTokens: 50_000 } });
    expect(assembled.systemPrompt).toContain("refactor JavaScript or TypeScript");
    expect(assembled.systemPrompt).not.toContain(PREFER_CONST_INSTRUCTIONS);
    expect((await skills.listCatalog()).find((entry) => entry.id === "prefer-const")).toMatchObject({
      id: "prefer-const",
      description: expect.stringContaining("refactor"),
      origin: "builtin",
      userInvocable: true,
      disableModelInvocation: false,
    });
    expect((await skills.listCatalog())[0]).not.toHaveProperty("instructions");
    expect(JSON.stringify(await skills.listCatalog())).not.toContain(PREFER_CONST_INSTRUCTIONS);
  });

  it("still lists prefer-const when the request matches, without the body", async () => {
    const skills = new SkillRegistry({ builtins: preferConstOnly(), files: new MemoryFiles() });
    const assembled = await engineFor(skills).build(snapshot("refactor this TypeScript module"), { budget: { maxTokens: 50_000 } });
    expect(assembled.systemPrompt).toContain("refactor JavaScript or TypeScript");
    expect(assembled.systemPrompt).not.toContain(PREFER_CONST_INSTRUCTIONS);
    const selected = await skills.select("refactor this TypeScript module");
    expect(selected[0]?.id).toBe("prefer-const");
    expect(selected[0]?.instructions).toContain(PREFER_CONST_INSTRUCTIONS);
  });

  it("restores baseline when the skill is disabled", async () => {
    const skills = new SkillRegistry({ builtins: preferConstOnly(), files: new MemoryFiles() });
    skills.setEnabled("prefer-const", false);
    const assembled = await engineFor(skills).build(snapshot("refactor this TypeScript module"), { budget: { maxTokens: 50_000 } });
    expect(assembled.systemPrompt).not.toContain(PREFER_CONST_INSTRUCTIONS);
    expect(assembled.systemPrompt).not.toContain("refactor JavaScript or TypeScript");
    expect(await skills.select("refactor this TypeScript module")).toEqual([]);
    expect((await skills.listCatalog()).find((entry) => entry.id === "prefer-const")?.enabled).toBe(false);
  });

  it("hides overlay-disabled skills from selection", async () => {
    const skills = new SkillRegistry({
      builtins: preferConstOnly(),
      files: new MemoryFiles(),
      getDisabledIds: () => ["builtin.skill.prefer-const"],
    });
    expect(await skills.select("refactor this TypeScript module")).toEqual([]);
    expect(await skills.listForPrompt("refactor this TypeScript module")).toEqual([]);
  });

  it("ignores a project skill whose frontmatter sets enabled: false", async () => {
    const files = new MemoryFiles({
      ".kursor/skills/prefer-const/SKILL.md": `---
name: prefer-const
description: Use when the user asks to refactor JavaScript or TypeScript bindings.
triggers: [refactor, javascript, typescript]
enabled: false
---
${PREFER_CONST_INSTRUCTIONS}
`,
    }, {
      ".kursor/skills": [{ name: "prefer-const", path: ".kursor/skills/prefer-const", kind: "directory" }],
    });
    const skills = new SkillRegistry({ includeBuiltins: false, files });
    const assembled = await engineFor(skills, files).build(snapshot("refactor this TypeScript module"), { budget: { maxTokens: 50_000 } });
    expect(assembled.systemPrompt).not.toContain(PREFER_CONST_INSTRUCTIONS);
    expect(await skills.select("refactor this TypeScript module")).toEqual([]);
  });

  it("loads global skills from the user data dir and skips project skills when none is active", async () => {
    const globalFiles = new MemoryFiles({
      "skills/debug/SKILL.md": `---
name: global-debug
description: debug failures
triggers: [debug]
---
Look for evidence.
`,
    }, {
      skills: [{ name: "debug", path: "skills/debug", kind: "directory" }],
    });
    const files = new MemoryFiles({
      ".kursor/skills/shipping/SKILL.md": `---
name: shipping
description: release checklist
triggers: [ship]
---
Ship it.
`,
    }, {
      ".kursor/skills": [{ name: "shipping", path: ".kursor/skills/shipping", kind: "directory" }],
    });
    const skills = new SkillRegistry({ includeBuiltins: false, files, globalFiles });
    const withoutProject = await skills.select("debug this failure", { includeProject: false });
    expect(withoutProject.map((skill) => skill.id)).toEqual(["debug"]);
    expect(withoutProject[0]?.origin).toBe("global");
    const withProject = await skills.select("ship the release", { includeProject: true });
    expect(withProject.map((skill) => skill.id)).toContain("shipping");
  });

  it("resolves slash ids case-insensitively and rewrites the user message", async () => {
    const skills = new SkillRegistry({ builtins: preferConstOnly(), files: new MemoryFiles() });
    const loaded = await skills.resolve("PREFER-CONST");
    expect(loaded?.id).toBe("prefer-const");
    const session = createSkillTurnSession(new TaskGrantStore());
    const rewritten = await tryApplySlashSkill(
      "/prefer-const src/App.tsx",
      skills,
      session,
      new ToolRegistry(),
      false,
    );
    expect(rewritten).toContain("Skill prefer-const loaded.");
    expect(rewritten).toContain(PREFER_CONST_INSTRUCTIONS);
    expect(rewritten).toContain("src/App.tsx");
    expect(session.invoked.map((skill) => skill.id)).toEqual(["prefer-const"]);
  });

  it("leaves unmatched slash text unchanged", async () => {
    const skills = new SkillRegistry({ builtins: preferConstOnly(), files: new MemoryFiles() });
    const session = createSkillTurnSession(new TaskGrantStore());
    const original = "/not-a-skill please";
    expect(await tryApplySlashSkill(original, skills, session, new ToolRegistry(), false)).toBe(original);
  });

  it("parses disable-model-invocation and excludes that skill from the listing", async () => {
    const parsed = parseSkill(`---
name: secret
description: hidden procedure
disable-model-invocation: true
user-invocable: true
---
Secret body.
`, "secret");
    expect(parsed.disableModelInvocation).toBe(true);
    expect(parsed.userInvocable).toBe(true);
    const files = new MemoryFiles({
      ".kursor/skills/secret/SKILL.md": `---
name: secret
description: hidden procedure
disable-model-invocation: true
---
Secret body.
`,
    }, {
      ".kursor/skills": [{ name: "secret", path: ".kursor/skills/secret", kind: "directory" }],
    });
    const skills = new SkillRegistry({ includeBuiltins: false, files });
    const listed = await skills.listForPrompt("hidden procedure");
    expect(listed.map((item) => item.skill.id)).toEqual([]);
    expect(await skills.resolve("secret")).toMatchObject({ id: "secret", disableModelInvocation: true });
  });

  it("sends full descriptions only for the top 8 when the catalog is larger than 12", async () => {
    const files: Record<string, string> = {};
    const dirs: { name: string; path: string; kind: "directory" }[] = [];
    for (let index = 0; index < SKILL_LISTING_FULL_THRESHOLD + 1; index += 1) {
      const id = `skill-${String(index).padStart(2, "0")}`;
      dirs.push({ name: id, path: `.kursor/skills/${id}`, kind: "directory" });
      files[`.kursor/skills/${id}/SKILL.md`] = `---
name: ${id}
description: ${index === 0 ? "unique-token-alpha procedure" : `generic listing ${id}`}
---
Body ${id} must stay out of the prompt.
`;
    }
    const store = new MemoryFiles(files, { ".kursor/skills": dirs });
    const skills = new SkillRegistry({ includeBuiltins: false, files: store });
    const listed = await skills.listForPrompt("unique-token-alpha");
    expect(listed).toHaveLength(SKILL_LISTING_FULL_THRESHOLD + 1);
    expect(listed.filter((item) => item.detail)).toHaveLength(SKILL_LISTING_DETAIL_TOP);
    expect(listed[0]?.skill.id).toBe("skill-00");
    expect(listed[0]?.detail).toBe(true);
    const assembled = await engineFor(skills, store).build(snapshot("unique-token-alpha"), { budget: { maxTokens: 50_000 } });
    expect(assembled.systemPrompt).toContain("unique-token-alpha procedure");
    expect(assembled.systemPrompt).not.toContain("Body skill-00 must stay out of the prompt.");
    expect(assembled.systemPrompt).toContain("- skill-12");
  });

  it("loads project skill folders even when listDirectory marks them as files", async () => {
    const files = new MemoryFiles({
      ".kursor/skills/search-first/SKILL.md": `---
name: search-first
description: Search the repo first
---
Search first.
`,
    }, {
      ".kursor/skills": [{ name: "search-first", path: ".kursor/skills/search-first", kind: "file" }],
    });
    const skills = new SkillRegistry({ includeBuiltins: false, files });
    const catalog = await skills.listCatalog();
    expect(catalog.map((item) => item.id)).toEqual(["search-first"]);
    expect(catalog[0]?.origin).toBe("project");
  });

  it("loads ECC playbooks from builtin/ as origin builtin", async () => {
    expect(BUILTIN_SKILLS.every((skill) => skill.origin === "builtin")).toBe(true);
    expect(BUILTIN_SKILLS.map((skill) => skill.id)).toEqual([
      "api-design",
      "brainstorming",
      "codebase-onboarding",
      "coding-standards",
      "contract-first",
      "dispatching-parallel-agents",
      "error-handling",
      "executing-plans",
      "finishing-a-development-branch",
      "git-workflow",
      "intent-driven-development",
      "prefer-const",
      "production-audit",
      "receiving-code-review",
      "requesting-code-review",
      "search-first",
      "security-review",
      "subagent-driven-brainstorming",
      "subagent-driven-planning",
      "systematic-debugging",
      "tdd-workflow",
      "test-driven-development",
      "testing-engine",
      "using-git-worktrees",
      "using-kursor-shell",
      "using-superpowers",
      "verification-before-completion",
      "writing-plans",
      "writing-skills",
    ]);
    const skills = new SkillRegistry({ includeBuiltins: true, files: new MemoryFiles() });
    const catalog = await skills.listCatalog();
    expect(catalog.filter((entry) => entry.origin === "builtin")).toHaveLength(BUILTIN_SKILLS.length);
    expect(catalog.find((entry) => entry.id === "search-first")?.origin).toBe("builtin");
  });

  it("resolves superpowers: and brainstorm aliases to brainstorming", async () => {
    const skills = new SkillRegistry({ includeBuiltins: true, files: new MemoryFiles() });
    const prefixed = await skills.resolve("superpowers:brainstorming");
    const alias = await skills.resolve("brainstorm");
    expect(prefixed?.id).toBe("brainstorming");
    expect(alias?.id).toBe("brainstorming");
  });
});
