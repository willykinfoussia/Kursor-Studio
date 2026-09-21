import { describe, expect, it } from "vitest";
import { RecoveryManager } from "../RecoveryManager";
import {
  contentHash,
  shouldCreateCheckpoint,
  type RecoveryFiles,
  type RecoveryGit,
} from "../types";

function memoryFiles(initial: Record<string, string> = {}) {
  const store = { ...initial };
  const files: RecoveryFiles = {
    async readFile(path) {
      if (!Object.prototype.hasOwnProperty.call(store, path)) throw new Error(`missing ${path}`);
      return store[path]!;
    },
    async writeFile(path, content) {
      store[path] = content;
    },
    async delete(path) {
      delete store[path];
    },
  };
  return { store, files };
}

function memoryGit(
  store: Record<string, string>,
  options: {
    repo?: boolean;
    sha?: string | null;
    blobs?: Record<string, Record<string, string>>;
  } = {},
) {
  const sha = options.sha === undefined ? "stashsha" : options.sha;
  const blobs = options.blobs ?? (sha ? { [sha]: { ...store } } : {});
  const restored: { sha: string; paths: string[] }[] = [];
  const git: RecoveryGit = {
    async isRepo() {
      return options.repo ?? true;
    },
    async stashCreate() {
      return sha;
    },
    async showPath(id, path) {
      return blobs[id]?.[path] ?? null;
    },
    async restorePaths(id, paths) {
      restored.push({ sha: id, paths: [...paths] });
      for (const path of paths) {
        const content = blobs[id]?.[path];
        if (content === undefined) delete store[path];
        else store[path] = content;
      }
    },
  };
  return { git, restored };
}

function okFile(path: string) {
  return { success: true, data: { path }, metadata: { path } };
}

describe("shouldCreateCheckpoint", () => {
  it("creates a checkpoint for medium and complex tasks only", () => {
    expect(shouldCreateCheckpoint("simple")).toBe(false);
    expect(shouldCreateCheckpoint("medium")).toBe(true);
    expect(shouldCreateCheckpoint("complex")).toBe(true);
  });
});

describe("RecoveryManager", () => {
  it("records a git stash SHA and restores agent paths from that SHA", async () => {
    const disk = memoryFiles({ "App.tsx": "old" });
    const git = memoryGit(disk.store, {
      repo: true,
      sha: "abc123",
      blobs: { abc123: { "App.tsx": "old" } },
    });
    const manager = new RecoveryManager({
      files: disk.files,
      git: git.git,
      id: () => "cp-git",
      now: () => 10,
    });

    const checkpoint = await manager.create();
    expect(checkpoint.kind).toBe("git");
    expect(checkpoint.gitSha).toBe("abc123");

    await manager.prepareTool("write_file", { path: "App.tsx", content: "agent" });
    await disk.files.writeFile("App.tsx", "agent");
    await manager.track("write_file", { path: "App.tsx", content: "agent" }, okFile("App.tsx"));

    const result = await manager.rollback();
    expect(git.restored).toEqual([{ sha: "abc123", paths: ["App.tsx"] }]);
    expect(result.restored).toEqual(["App.tsx"]);
    expect(disk.store["App.tsx"]).toBe("old");
  });

  it("captures journal baseline before a snapshot write", async () => {
    const disk = memoryFiles({ "App.tsx": "before" });
    const git = memoryGit(disk.store, { repo: false, sha: null });
    const manager = new RecoveryManager({ files: disk.files, git: git.git });

    const checkpoint = await manager.create();
    expect(checkpoint.kind).toBe("snapshot");
    expect(checkpoint.gitSha).toBeUndefined();

    await manager.prepareTool("write_file", { path: "App.tsx", content: "after" });
    expect(manager.checkpoint?.journal["App.tsx"]).toEqual({ existed: true, content: "before" });
    await disk.files.writeFile("App.tsx", "after");
    await manager.track("write_file", { path: "App.tsx", content: "after" }, okFile("App.tsx"));

    const result = await manager.rollback();
    expect(result.restored).toEqual(["App.tsx"]);
    expect(disk.store["App.tsx"]).toBe("before");
  });

  it("skips rollback when a human edited an agent path", async () => {
    const disk = memoryFiles({ "App.tsx": "old" });
    const git = memoryGit(disk.store, { repo: false, sha: null });
    const manager = new RecoveryManager({ files: disk.files, git: git.git });

    await manager.create();
    await manager.prepareTool("write_file", { path: "App.tsx", content: "agent" });
    await disk.files.writeFile("App.tsx", "agent");
    await manager.track("write_file", { path: "App.tsx", content: "agent" }, okFile("App.tsx"));
    await disk.files.writeFile("App.tsx", "human");

    const result = await manager.rollback();
    expect(result.skippedExternal).toEqual(["App.tsx"]);
    expect(result.restored).toEqual([]);
    expect(disk.store["App.tsx"]).toBe("human");
  });

  it("classifies created, modified, deleted, commands, and tests in the change log", async () => {
    const disk = memoryFiles({ "App.tsx": "old", "gone.ts": "bye" });
    const git = memoryGit(disk.store, { repo: false, sha: null });
    const manager = new RecoveryManager({ files: disk.files, git: git.git });

    await manager.create();

    await manager.prepareTool("create_file", { path: "TodoFilter.tsx", content: "new" });
    await disk.files.writeFile("TodoFilter.tsx", "new");
    await manager.track("create_file", { path: "TodoFilter.tsx", content: "new" }, okFile("TodoFilter.tsx"));

    await manager.prepareTool("write_file", { path: "App.tsx", content: "changed" });
    await disk.files.writeFile("App.tsx", "changed");
    await manager.track("write_file", { path: "App.tsx", content: "changed" }, okFile("App.tsx"));

    await manager.prepareTool("delete_file", { path: "gone.ts" });
    await disk.files.delete("gone.ts");
    await manager.track("delete_file", { path: "gone.ts" }, okFile("gone.ts"));

    await manager.track("run_command", { command: "pnpm lint" }, {
      success: true,
      data: { command: "pnpm lint", exitCode: 0 },
      metadata: { exitCode: 0 },
    });
    await manager.track("run_command", { command: "pnpm test" }, {
      success: false,
      data: { command: "pnpm test", exitCode: 1 },
      metadata: { exitCode: 1 },
    });
    await manager.track("run_command", { command: "cargo test" }, {
      success: true,
      data: { command: "cargo test", exitCode: 0 },
      metadata: { exitCode: 0 },
    });
    await manager.track("run_command", { command: "pytest" }, {
      success: true,
      data: { command: "pytest", exitCode: 0 },
      metadata: { exitCode: 0 },
    });

    const log = manager.changeLog;
    expect(log?.created).toEqual(["TodoFilter.tsx"]);
    expect(log?.modified).toEqual(["App.tsx"]);
    expect(log?.deleted).toEqual(["gone.ts"]);
    expect(log?.commandsExecuted.map((entry) => entry.command)).toEqual([
      "pnpm lint",
      "pnpm test",
      "cargo test",
      "pytest",
    ]);
    expect(log?.testsExecuted).toEqual([
      { command: "pnpm test", ok: false },
      { command: "cargo test", ok: true },
      { command: "pytest", ok: true },
    ]);
    expect(manager.checkpoint?.lastAgentHashes["App.tsx"]).toBe(contentHash("changed"));
  });

  it("does not delete a created file that a human edited", async () => {
    const disk = memoryFiles();
    const git = memoryGit(disk.store, { repo: false, sha: null });
    const manager = new RecoveryManager({ files: disk.files, git: git.git });

    await manager.create();
    await manager.prepareTool("create_file", { path: "New.tsx", content: "agent" });
    await disk.files.writeFile("New.tsx", "agent");
    await manager.track("create_file", { path: "New.tsx", content: "agent" }, okFile("New.tsx"));
    await disk.files.writeFile("New.tsx", "human");

    const result = await manager.rollback();
    expect(result.skippedExternal).toEqual(["New.tsx"]);
    expect(disk.store["New.tsx"]).toBe("human");
  });
});
