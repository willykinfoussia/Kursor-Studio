import { describe, expect, it } from "vitest";
import { SkillDocumentService, type ProjectSkillFiles, type UserSkillFiles } from "../../skills/SkillDocument";
import type { GraphFileStore, WalkedFile } from "../../../graph/types";
import { applyProposal } from "../applyProposal";
import type { KnowledgeProposal } from "../types";

function memoryProject(): ProjectSkillFiles & { files: Map<string, string> } {
  const files = new Map<string, string>();
  return {
    files,
    hasProject: () => true,
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

function memoryGraph(): GraphFileStore & { files: Map<string, string> } {
  const files = new Map<string, string>();
  return {
    files,
    walkFiles: async (): Promise<WalkedFile[]> => [...files.keys()].map((relativePath) => ({
      relativePath,
      size: files.get(relativePath)?.length ?? 0,
      modifiedAt: 0,
    })),
    readFile: async (path) => {
      if (!files.has(path)) throw new Error(`missing ${path}`);
      return files.get(path) ?? "";
    },
    writeFile: async (path, content) => {
      files.set(path, content);
    },
    createDirectory: async () => undefined,
    delete: async (path) => {
      files.delete(path);
    },
  };
}

function proposal(overrides: Partial<KnowledgeProposal> = {}): KnowledgeProposal {
  return {
    id: "kp-1",
    projectId: "p1",
    runId: "run-1",
    conversationId: "c1",
    createdAt: 1,
    updatedAt: 1,
    status: "pending",
    summary: "Auth knowledge",
    payload: { summary: "Auth knowledge", skillActions: [], specActions: [] },
    ...overrides,
  };
}

describe("applyProposal", () => {
  it("creates a project skill from a draft", async () => {
    const project = memoryProject();
    const skills = new SkillDocumentService({ project, user: memoryUser(), builtins: () => [] });
    await applyProposal(proposal({
      payload: {
        summary: "Search procedure",
        skillActions: [{
          id: "skill:0:search-first",
          action: "create",
          skillId: "search-first",
          scope: "project",
          rationale: "Reusable search",
          draft: {
            name: "Search first",
            description: "Use when searching the repo",
            triggers: ["search"],
            instructions: "Search before writing helpers.",
          },
        }],
        specActions: [],
      },
    }), { skills, files: memoryGraph() });
    expect(project.files.get(".kursor/skills/search-first/SKILL.md")).toContain("Search before writing helpers.");
  });

  it("creates, updates, deletes, and reorganizes specs on a memory graph", async () => {
    const files = memoryGraph();
    const skills = new SkillDocumentService({ project: memoryProject(), user: memoryUser(), builtins: () => [] });
    const created = await applyProposal(proposal({
      payload: {
        summary: "Auth spec",
        skillActions: [],
        specActions: [{
          id: "spec:0:auth.md",
          action: "create",
          scope: "project",
          kind: "technical",
          fileName: "auth.md",
          rationale: "Document JWT",
          content: "# Auth\nUse refresh tokens.",
        }],
      },
    }), { skills, files });
    expect(created.specs[0]).toBe(".kursor/specs/project/technical/auth.md");
    expect(files.files.get(created.specs[0])).toBe("# Auth\nUse refresh tokens.");

    await applyProposal(proposal({
      payload: {
        summary: "Update auth",
        skillActions: [],
        specActions: [{
          id: "spec:1:auth.md",
          action: "update",
          scope: "project",
          path: created.specs[0],
          rationale: "Add rotation",
          content: "# Auth\nRotate refresh tokens.",
        }],
      },
    }), { skills, files });
    expect(files.files.get(created.specs[0])).toContain("Rotate refresh tokens.");

    const moved = await applyProposal(proposal({
      payload: {
        summary: "Move auth",
        skillActions: [],
        specActions: [{
          id: "spec:2:auth.md",
          action: "reorganize",
          scope: "project",
          path: created.specs[0],
          targetPath: ".kursor/specs/project/auth/auth.md",
          group: "auth",
          rationale: "Wrong group",
        }],
      },
    }), { skills, files });
    expect(files.files.has(created.specs[0])).toBe(false);
    expect(files.files.get(moved.specs[0])).toContain("Rotate refresh tokens.");

    await applyProposal(proposal({
      payload: {
        summary: "Drop auth",
        skillActions: [],
        specActions: [{
          id: "spec:3:auth.md",
          action: "delete",
          scope: "project",
          path: moved.specs[0],
          rationale: "Obsolete",
        }],
      },
    }), { skills, files });
    expect(files.files.has(moved.specs[0])).toBe(false);
  });

  it("applies only selected actions", async () => {
    const files = memoryGraph();
    const project = memoryProject();
    const skills = new SkillDocumentService({ project, user: memoryUser(), builtins: () => [] });
    await applyProposal(proposal({
      payload: {
        summary: "Two actions",
        skillActions: [{
          id: "skill:0:search-first",
          action: "create",
          skillId: "search-first",
          scope: "project",
          rationale: "keep",
          draft: { name: "Search first", description: "search", triggers: [], instructions: "Search." },
        }],
        specActions: [{
          id: "spec:0:skip",
          action: "create",
          scope: "project",
          fileName: "skip.md",
          rationale: "skip",
          content: "no",
        }],
      },
    }), { skills, files }, { skillIds: ["skill:0:search-first"], specIds: [] });
    expect(project.files.has(".kursor/skills/search-first/SKILL.md")).toBe(true);
    expect(files.files.size).toBe(0);
  });
});
