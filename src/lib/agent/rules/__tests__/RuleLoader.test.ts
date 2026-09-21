import { describe, expect, it } from "vitest";
import { assembleSystemPrompt } from "../../context/assemble";
import type { ContextFileStore, ContextSnapshot } from "../../context/types";
import { RuleLoader } from "../RuleLoader";

class MemoryFiles implements ContextFileStore {
  constructor(
    private readonly files: Record<string, string>,
    private readonly dirs: Record<string, { name: string; path: string; kind: "file" | "directory" }[]>,
  ) {}

  async readFile(path: string) {
    if (!(path in this.files)) throw new Error(`missing ${path}`);
    return this.files[path] ?? "";
  }

  async listDirectory(path: string) {
    return this.dirs[path] ?? [];
  }
}

describe("RuleLoader precedence", () => {
  it("places user rules after project and agent overlay", async () => {
    const project = new MemoryFiles({
      "KURSOR.md": "project says tabs",
      ".kursor/agents/coding-agent.md": "agent overlay",
    }, {
      ".kursor/rules": [],
      ".kursor/agents": [{ name: "coding-agent.md", path: ".kursor/agents/coding-agent.md", kind: "file" }],
    });
    const user = new MemoryFiles({
      "rules/style.md": "user says spaces",
    }, {
      rules: [{ name: "style.md", path: "rules/style.md", kind: "file" }],
    });
    const loader = new RuleLoader({ projectFiles: project, userFiles: user, agentId: "coding-agent" });
    const rules = await loader.load(true);
    const slices = loader.toSlices(rules);
    const prompt = assembleSystemPrompt(slices, { project: { id: "p", name: "App", rootPath: "/" } } as ContextSnapshot, false);
    const agentAt = prompt.indexOf("agent overlay");
    const projectAt = prompt.indexOf("project says tabs");
    const userAt = prompt.indexOf("user says spaces");
    expect(agentAt).toBeGreaterThan(-1);
    expect(projectAt).toBeGreaterThan(agentAt);
    expect(userAt).toBeGreaterThan(projectAt);
    expect(prompt.indexOf("User rules")).toBeGreaterThan(prompt.indexOf("Project rules"));
    expect(prompt.indexOf("Project rules")).toBeGreaterThan(prompt.indexOf("Agent rules"));
  });
});
