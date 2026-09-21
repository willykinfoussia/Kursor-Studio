import { describe, expect, it } from "vitest";
import { ContextEngine, type ContextEngineOptions } from "../ContextEngine";
import { SkillRegistry } from "../../skills/SkillRegistry";
import { rankSlices } from "../rank";
import { estimateTokens } from "../tokens";
import type {
  ContextFileStore,
  ContextSnapshot,
  ContextSlice,
} from "../types";
import type { AgentMessage } from "../../types";

function message(id: string, role: AgentMessage["role"], content: string, timestamp = 1): AgentMessage {
  return { id, role, content, timestamp };
}

function snapshot(partial: Partial<ContextSnapshot> = {}): ContextSnapshot {
  const request = partial.request ?? "fix the login form";
  return {
    request,
    messages: partial.messages ?? [message("u1", "user", request)],
    project: { id: "p1", name: "TodoApp", rootPath: "C:/Projects/TodoApp" },
    currentFile: null,
    openFiles: [],
    toolCalls: [],
    webDocuments: [],
    activeTask: null,
    maxContextChars: 6_000,
    ...partial,
  };
}

class FakeFiles implements ContextFileStore {
  constructor(
    private readonly files: Record<string, string> = {},
    private readonly dirs: Record<string, { name: string; path: string; kind: "file" | "directory" }[]> = {},
  ) {}

  async readFile(path: string) {
    if (!(path in this.files)) throw new Error(`missing ${path}`);
    return this.files[path] ?? "";
  }

  async listDirectory(path: string) {
    if (!(path in this.dirs)) throw new Error(`missing ${path}`);
    return this.dirs[path] ?? [];
  }
}

function engine(options: ContextEngineOptions = {}) {
  return new ContextEngine({
    files: new FakeFiles(),
    git: {
      status: async () => ({ branch: "main", changedFiles: [], clean: true }),
      diff: async () => ({ diff: "" }),
    },
    retrievers: {
      memories: async () => [],
      rag: async () => [],
    },
    ...options,
  });
}

describe("token estimate", () => {
  it("uses ceil chars/4", () => {
    expect(estimateTokens("")).toBe(0);
    expect(estimateTokens("abcd")).toBe(1);
    expect(estimateTokens("abcde")).toBe(2);
  });
});

describe("rankSlices", () => {
  it("is stable for equal priority and score", () => {
    const slices: ContextSlice[] = [
      { id: "b", source: "rag", priority: 9, score: 0.5, tokens: 1, text: "b" },
      { id: "a", source: "rag", priority: 9, score: 0.5, tokens: 1, text: "a" },
    ];
    expect(rankSlices(slices).map((slice) => slice.id)).toEqual(["a", "b"]);
    expect(rankSlices(slices).map((slice) => slice.id)).toEqual(["a", "b"]);
  });
});

describe("ContextEngine", () => {
  it("never drops the user request when over budget", async () => {
    const assembled = await engine().build(snapshot({
      messages: [
        message("old", "assistant", "a very long previous answer ".repeat(40)),
        message("u1", "user", "fix the login form"),
      ],
    }), { budget: { maxTokens: 1 } });
    expect(assembled.messages.some((item) => item.content === "fix the login form")).toBe(true);
    expect(assembled.slices.some((slice) => slice.priority === 1)).toBe(true);
  });

  it("drops old conversation and rag before the request", async () => {
    const assembled = await engine({
      retrievers: {
        memories: async () => [],
        rag: async () => [
          { id: "r1", content: "unrelated chunk ".repeat(80), score: 0.2, sourcePath: "docs/note.md" },
        ],
      },
    }).build(snapshot({
      messages: [
        message("m1", "user", "old question"),
        message("m2", "assistant", "old answer"),
        message("u1", "user", "fix the login form"),
      ],
    }), { budget: { maxTokens: 1, maxHistoryMessages: 30 } });
    expect(assembled.slices.some((slice) => slice.source === "rag")).toBe(false);
    expect(assembled.messages.at(-1)?.content).toBe("fix the login form");
  });

  it("caps rag chunks and keeps the highest score", async () => {
    const assembled = await engine({
      retrievers: {
        memories: async () => [],
        rag: async () => [
          { id: "low", content: "alpha", score: 0.1, sourcePath: "a.ts" },
          { id: "high", content: "beta", score: 0.9, sourcePath: "b.ts" },
          { id: "mid", content: "gamma", score: 0.4, sourcePath: "c.ts" },
        ],
      },
    }).build(snapshot(), { budget: { maxRagChunks: 1, maxTokens: 50_000 } });
    const rag = assembled.slices.filter((slice) => slice.source === "rag");
    expect(rag).toHaveLength(1);
    expect(rag[0]?.meta?.ragId).toBe("high");
  });

  it("dedupes rag chunks that repeat the current file", async () => {
    const assembled = await engine({
      retrievers: {
        memories: async () => [],
        rag: async () => [
          { id: "dup", content: "from app", score: 0.9, sourcePath: "src/App.tsx" },
          { id: "other", content: "from other", score: 0.5, sourcePath: "src/lib/util.ts" },
        ],
      },
    }).build(snapshot({
      currentFile: { path: "src/App.tsx", content: "export function App() { return null }" },
    }), { budget: { maxTokens: 50_000 } });
    expect(assembled.slices.filter((slice) => slice.source === "rag").map((slice) => slice.meta?.path)).toEqual(["src/lib/util.ts"]);
  });

  it("produces the same slice ids for the same snapshot", async () => {
    const input = snapshot({
      currentFile: { path: "src/App.tsx", content: "const x = 1;" },
      openFiles: [{ path: "src/App.tsx", isDirty: false }, { path: "README.md", isDirty: true }],
      messages: [
        message("m1", "user", "hello"),
        message("m2", "assistant", "hi"),
        message("u1", "user", "fix the login form"),
      ],
    });
    const first = await engine().build(input, { budget: { maxTokens: 50_000 } });
    const second = await engine().build(input, { budget: { maxTokens: 50_000 } });
    expect(first.slices.map((slice) => slice.id)).toEqual(second.slices.map((slice) => slice.id));
    expect(first.systemPrompt).toBe(second.systemPrompt);
  });

  it("skips project-bound sources without a project", async () => {
    const assembled = await engine().build(snapshot({ project: null, request: "hello", messages: [message("u1", "user", "hello")] }));
    for (const source of ["git", "memory", "project", "rag", "rule", "graph"] as const) {
      expect(assembled.trace.find((entry) => entry.source === source)?.included).toBe(false);
    }
    expect(assembled.trace.find((entry) => entry.source === "git")?.reason).toBe("no project");
    expect(assembled.trace.find((entry) => entry.source === "skill")?.included).toBe(true);
    expect(assembled.slices.some((slice) => slice.priority === 1)).toBe(true);
  });

  it("includes web documents and omits web tools from tool slices", async () => {
    const assembled = await engine().build(snapshot({
      webDocuments: [{
        title: "Example Docs",
        url: "https://example.com/docs",
        snippet: "Latest API",
        content: "body",
        retrievedAt: 1,
      }],
      toolCalls: [
        { id: "t1", tool: "web_search", input: { query: "docs" }, output: { results: [] }, status: "completed" },
        { id: "t2", tool: "read_file", input: { path: "a.ts" }, output: { ok: true }, status: "completed" },
      ],
    }), { budget: { maxTokens: 50_000 } });
    expect(assembled.slices.some((slice) => slice.source === "web" && slice.meta?.url === "https://example.com/docs")).toBe(true);
    expect(assembled.systemPrompt).toContain("Web");
    expect(assembled.slices.filter((slice) => slice.source === "tool").map((slice) => slice.meta?.tool)).toEqual(["read_file"]);
  });

  it("includes git status without a full diff unless paths overlap", async () => {
    const git = {
      status: async () => ({ branch: "main", changedFiles: ["src/App.tsx"], clean: false }),
      diff: async () => ({ diff: "diff --git a/src/App.tsx\n+hello" }),
    };
    const quiet = await engine({ git }).build(snapshot({
      request: "explain the architecture",
      messages: [message("u1", "user", "explain the architecture")],
      currentFile: { path: "README.md", content: "# app" },
    }), { budget: { maxTokens: 50_000 } });
    expect(quiet.slices.some((slice) => slice.id === "git:status")).toBe(true);
    expect(quiet.slices.some((slice) => slice.id === "git:diff")).toBe(false);

    const withOverlap = await engine({ git }).build(snapshot({
      request: "look at src/App.tsx",
      messages: [message("u1", "user", "look at src/App.tsx")],
    }), { budget: { maxTokens: 50_000 } });
    expect(withOverlap.slices.some((slice) => slice.id === "git:diff")).toBe(true);
  });

  it("loads rules in KURSOR.md then AGENTS.md then sorted extras", async () => {
    const files = new FakeFiles({
      "KURSOR.md": "kursor first",
      "AGENTS.md": "agents second",
      ".kursor/rules/z-extra.md": "z",
      ".kursor/rules/a-extra.md": "a",
    }, {
      ".kursor/rules": [
        { name: "z-extra.md", path: ".kursor/rules/z-extra.md", kind: "file" },
        { name: "a-extra.md", path: ".kursor/rules/a-extra.md", kind: "file" },
      ],
      ".kursor/skills": [],
    });
    const assembled = await engine({ files }).build(snapshot(), { budget: { maxTokens: 50_000 } });
    const rules = assembled.slices.filter((slice) => slice.source === "rule").map((slice) => slice.meta?.path);
    expect(rules).toEqual(["KURSOR.md", "AGENTS.md", ".kursor/rules/a-extra.md", ".kursor/rules/z-extra.md"]);
  });

  it("lists skill descriptions without injecting bodies", async () => {
    const files = new FakeFiles({
      ".kursor/skills/debug/SKILL.md": "---\nname: systematic-debug\ndescription: debug failures\n---\nLook for evidence.",
      ".kursor/skills/unrelated/SKILL.md": "---\nname: shipping\ndescription: release checklist\n---\nShip it.",
    }, {
      ".kursor/skills": [
        { name: "debug", path: ".kursor/skills/debug", kind: "directory" },
        { name: "unrelated", path: ".kursor/skills/unrelated", kind: "directory" },
      ],
      ".kursor/rules": [],
    });
    const skills = new SkillRegistry({ includeBuiltins: false, files });
    const assembled = await engine({ files, skills }).build(snapshot({
      request: "help me debug this failure",
      messages: [message("u1", "user", "help me debug this failure")],
    }), { budget: { maxTokens: 50_000 } });
    const listing = assembled.slices.filter((slice) => slice.source === "skill");
    expect(listing).toHaveLength(1);
    expect(assembled.systemPrompt).toContain("debug failures");
    expect(assembled.systemPrompt).toContain("release checklist");
    expect(assembled.systemPrompt).not.toContain("Look for evidence.");
    expect(assembled.systemPrompt).not.toContain("Ship it.");

    const bodyOnly = await engine({ files, skills }).build(snapshot({
      request: "Look for evidence",
      messages: [message("u1", "user", "Look for evidence")],
    }), { budget: { maxTokens: 50_000 } });
    expect(bodyOnly.slices.filter((slice) => slice.source === "skill")).toHaveLength(1);
    expect(bodyOnly.systemPrompt).not.toContain("Look for evidence.");
  });

  it("keeps tool input and output together", async () => {
    const assembled = await engine().build(snapshot({
      toolCalls: [
        { id: "t1", tool: "read_file", input: { path: "a.ts" }, output: { ok: true }, status: "completed" },
        { id: "t2", tool: "write_file", input: { path: "b.ts" }, output: { ok: true }, status: "completed" },
      ],
    }), { budget: { maxTokens: 1 } });
    const tools = assembled.slices.filter((slice) => slice.source === "tool");
    for (const slice of tools) {
      expect(slice.text).toContain("->");
    }
  });

  it("caps the number of file-bearing slices", async () => {
    const assembled = await engine({
      retrievers: {
        memories: async () => [],
        rag: async () => [
          { id: "1", content: "one", score: 0.9, sourcePath: "a.ts" },
          { id: "2", content: "two", score: 0.8, sourcePath: "b.ts" },
          { id: "3", content: "three", score: 0.7, sourcePath: "c.ts" },
        ],
      },
    }).build(snapshot({
      currentFile: { path: "src/App.tsx", content: "app" },
    }), { budget: { maxFiles: 2, maxTokens: 50_000 } });
    const files = assembled.slices.filter((slice) => slice.meta?.path && (slice.source === "rag" || slice.source === "editor"));
    expect(files.length).toBeLessThanOrEqual(2);
  });

  it("does not dump the project tree", async () => {
    const assembled = await engine().build(snapshot(), { budget: { maxTokens: 50_000 } });
    const project = assembled.slices.filter((slice) => slice.source === "project");
    expect(project).toHaveLength(1);
    expect(project[0]?.text).toContain("TodoApp");
    expect(project[0]?.text).not.toContain("node_modules");
    expect(assembled.systemPrompt).not.toContain("src/components");
  });

  it("records include and skip reasons with token counts", async () => {
    const assembled = await engine({
      retrievers: {
        memories: async () => [{ id: "m1", memoryType: "fact", content: "uses zustand" }],
        rag: async () => [],
      },
    }).build(snapshot(), { budget: { maxTokens: 50_000 } });
    const memory = assembled.trace.find((entry) => entry.source === "memory");
    expect(memory?.included).toBe(true);
    expect(memory?.tokens).toBeGreaterThan(0);
    expect(memory?.reason).toBe("selected");
    const rag = assembled.trace.find((entry) => entry.source === "rag");
    expect(rag?.included).toBe(false);
    expect(rag?.reason).toBe("no matching rag chunks");
  });

  it("includes the active task and open file names", async () => {
    const assembled = await engine().build(snapshot({
      activeTask: { id: "task-1", title: "Fix login", status: "running", progress: 40 },
      openFiles: [{ path: "src/App.tsx", isDirty: true }],
      currentFile: { path: "src/App.tsx", content: "export const App = () => null;" },
    }), { budget: { maxTokens: 50_000 } });
    expect(assembled.systemPrompt).toContain("Fix login");
    expect(assembled.systemPrompt).toContain("Open files:");
    expect(assembled.systemPrompt).toContain("src/App.tsx");
  });
});
