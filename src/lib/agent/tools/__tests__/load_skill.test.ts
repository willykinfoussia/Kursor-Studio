import { describe, expect, it } from "vitest";
import type { ContextFileStore } from "../../context/types";
import { TaskGrantStore } from "../../permissions/grants";
import { createSkillTurnSession } from "../../skills/session";
import { SkillRegistry } from "../../skills/SkillRegistry";
import { ToolRegistry } from "../../ToolRegistry";
import { toolPermission } from "../../permissions/meta";
import { idleToolContext, okResult } from "../result";
import { toolSchema } from "../schema";
import { createLoadSkillTool } from "../loadSkill";
import { SkillDocumentService } from "../../skills/SkillDocument";
import type { AgentTool } from "../../ToolRegistry";
import type { ProjectSkillFiles } from "../../skills/SkillDocument";

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

function fetchTool(): AgentTool {
  return {
    name: "fetch_url",
    description: "fetch",
    ...toolPermission("network.fetch", "medium"),
    timeoutMs: 1_000,
    mutate: false,
    parameters: toolSchema({ url: { type: "string" } }, ["url"]),
    execute: async () => okResult({}),
  };
}

const DEMO_SKILL_MD = `---
name: demo
description: demo skill
allowedTools: [fetch_url]
---
Do the demo with $ARGUMENTS.
`;

describe("load_skill", () => {
  const files = new MemoryFiles({
    ".kursor/skills/demo/SKILL.md": DEMO_SKILL_MD,
    ".kursor/skills/locked/SKILL.md": `---
name: locked
description: locked skill
disable-model-invocation: true
---
Secret.
`,
  }, {
    ".kursor/skills": [
      { name: "demo", path: ".kursor/skills/demo", kind: "directory" },
      { name: "locked", path: ".kursor/skills/locked", kind: "directory" },
    ],
  });

  function memoryProject(map: Record<string, string>): ProjectSkillFiles {
    const stored = new Map(Object.entries(map));
    return {
      hasProject: () => true,
      readFile: async (path) => {
        if (!stored.has(path)) throw new Error(`missing ${path}`);
        return stored.get(path) ?? "";
      },
      writeFile: async (path, content) => { stored.set(path, content); },
      createDirectory: async () => undefined,
      delete: async () => undefined,
      listFiles: async (directory) => {
        const prefix = `${directory.replace(/\/$/, "")}/`;
        return [...stored.keys()].filter((path) => path.startsWith(prefix));
      },
    };
  }

  it("loads a skill and returns the rendered prompt", async () => {
    const skills = new SkillRegistry({ includeBuiltins: false, files });
    const tools = new ToolRegistry();
    tools.register(fetchTool());
    const grants = new TaskGrantStore();
    const session = createSkillTurnSession(grants);
    const result = await createLoadSkillTool({
      skills,
      tools,
      documents: new SkillDocumentService({
        project: memoryProject({ ".kursor/skills/demo/SKILL.md": DEMO_SKILL_MD }),
        builtins: () => [],
      }),
    }).execute(
      { skill: "demo", args: "now" },
      idleToolContext("C:/Projects/TodoApp", { skillSession: session }),
    );
    expect(result.success).toBe(true);
    expect(result.data).toMatchObject({
      skill: "demo",
      origin: "project",
      args: "now",
      description: "demo skill",
      prompt: "Do the demo with now.",
    });
    expect(session.invoked.map((skill) => skill.id)).toEqual(["demo"]);
  });

  it("fails for an unknown id", async () => {
    const skills = new SkillRegistry({ includeBuiltins: false, files });
    const result = await createLoadSkillTool({ skills }).execute({ skill: "missing" }, idleToolContext());
    expect(result.success).toBe(false);
    expect(result.error?.code).toBe("unknown_skill");
  });

  it("denies disableModelInvocation unless the user slashed that skill", async () => {
    const skills = new SkillRegistry({ includeBuiltins: false, files });
    const denied = await createLoadSkillTool({ skills }).execute(
      { skill: "locked" },
      idleToolContext("C:/Projects/TodoApp", { skillSession: createSkillTurnSession(new TaskGrantStore()) }),
    );
    expect(denied.success).toBe(false);
    expect(denied.error?.code).toBe("model_invocation_disabled");

    const allowedSession = createSkillTurnSession(new TaskGrantStore());
    allowedSession.userInvokedIds.push("locked");
    const allowed = await createLoadSkillTool({ skills }).execute(
      { skill: "locked" },
      idleToolContext("C:/Projects/TodoApp", { skillSession: allowedSession }),
    );
    expect(allowed.success).toBe(true);
  });

  it("lists supporting files and reads one on demand", async () => {
    const documents = new SkillDocumentService({
      project: memoryProject({
        ".kursor/skills/demo/SKILL.md": DEMO_SKILL_MD,
        ".kursor/skills/demo/tests.md": "Write the failing test first.",
      }),
      builtins: () => [],
    });
    const skills = new SkillRegistry({ includeBuiltins: false, files });
    const loaded = await createLoadSkillTool({ skills, documents }).execute(
      { skill: "demo" },
      idleToolContext("C:/Projects/TodoApp"),
    );
    expect(loaded.success).toBe(true);
    expect(loaded.data).toMatchObject({
      supportingFiles: ["tests.md"],
    });
    expect(String((loaded.data as { prompt?: string }).prompt)).toContain("file=…");

    const extra = await createLoadSkillTool({ skills, documents }).execute(
      { skill: "demo", file: "tests.md" },
      idleToolContext("C:/Projects/TodoApp"),
    );
    expect(extra.success).toBe(true);
    expect(extra.data).toMatchObject({
      file: "tests.md",
      content: "Write the failing test first.",
    });
  });

  it("refuses a supporting file outside the skill folder", async () => {
    const documents = new SkillDocumentService({
      project: memoryProject({
        ".kursor/skills/demo/SKILL.md": DEMO_SKILL_MD,
      }),
      builtins: () => [],
    });
    const skills = new SkillRegistry({ includeBuiltins: false, files });
    const result = await createLoadSkillTool({ skills, documents }).execute(
      { skill: "demo", file: "../secrets" },
      idleToolContext("C:/Projects/TodoApp"),
    );
    expect(result.success).toBe(false);
    expect(result.error?.code).toBe("invalid_path");
  });
});
