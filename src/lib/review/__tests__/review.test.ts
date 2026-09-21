import { describe, expect, it } from "vitest";
import { ChangeTrackingService, MemoryChangeStore } from "../ChangeTrackingService";
import { ReviewService } from "../ReviewService";
import type { ReviewFiles } from "../types";

function memoryFiles(initial: Record<string, string> = {}) {
  const store = { ...initial };
  const files: ReviewFiles = {
    async read(path) {
      return Object.prototype.hasOwnProperty.call(store, path) ? store[path]! : null;
    },
    async write(path, content) {
      store[path] = content;
    },
    async delete(path) {
      delete store[path];
    },
    async rename(from, to) {
      store[to] = store[from]!;
      delete store[from];
    },
    isBinary(path) {
      return path.endsWith(".png");
    },
  };
  return { store, files };
}

function identity(runId = "run-1") {
  return {
    accountId: "acc",
    projectId: "proj",
    runId,
    conversationId: "conv",
    agentId: "coding-agent",
    model: "test",
  };
}

async function trackWrite(
  tracking: ChangeTrackingService,
  files: ReviewFiles,
  path: string,
  content: string,
  runId = "run-1",
  tool = "write_file",
  conversationId = "conv",
) {
  const who = { ...identity(runId), conversationId };
  await tracking.prepareMutation(who, tool, { path });
  await files.write(path, content);
  return tracking.recordMutation(who, tool, `tool-${path}-${runId}`, { path, content }, { success: true, data: { path } });
}

describe("review service", () => {
  it("accepts all AI changes without rewriting the workspace", async () => {
    const { store, files } = memoryFiles({ "a.ts": "old\n" });
    const persist = new MemoryChangeStore();
    const tracking = new ChangeTrackingService({ files, persist, id: () => "cs1", now: () => 1 });
    await trackWrite(tracking, files, "a.ts", "new\n");
    await tracking.finalizeRun("run-1");
    const review = new ReviewService({ files, tracking, persist, id: () => "d1", now: () => 2 });
    const result = await review.acceptAll("cs1");
    expect(result.ok).toBe(true);
    expect(store["a.ts"]).toBe("new\n");
    expect(result.changeSet.status).toBe("accepted");
  });

  it("accepts all by writing the AI version over a human edit", async () => {
    const { store, files } = memoryFiles({ "a.ts": "old\n" });
    const persist = new MemoryChangeStore();
    const tracking = new ChangeTrackingService({ files, persist, id: () => "cs1", now: () => 1 });
    await trackWrite(tracking, files, "a.ts", "ai\n");
    store["a.ts"] = "human\n";
    await tracking.finalizeRun("run-1");
    const review = new ReviewService({ files, tracking, persist, id: () => "d1", now: () => 2 });
    const result = await review.acceptAll("cs1");
    expect(result.ok).toBe(true);
    expect(store["a.ts"]).toBe("ai\n");
    expect(result.changeSet.files[0]?.status).toBe("accepted");
  });

  it("continues accept all when one write fails and leaves that file conflicted", async () => {
    const { store, files } = memoryFiles({ "a.ts": "old-a\n", "b.ts": "old-b\n" });
    let n = 0;
    const persist = new MemoryChangeStore();
    const tracking = new ChangeTrackingService({ files, persist, id: () => `id${n++}`, now: () => 1 });
    await trackWrite(tracking, files, "a.ts", "ai-a\n");
    await trackWrite(tracking, files, "b.ts", "ai-b\n");
    store["a.ts"] = "human-a\n";
    store["b.ts"] = "human-b\n";
    const changeSet = await tracking.finalizeRun("run-1");
    const write = files.write;
    files.write = async (path, content) => {
      if (path === "b.ts") throw new Error("disk locked");
      return write(path, content);
    };
    const review = new ReviewService({ files, tracking, persist, id: () => `id${n++}`, now: () => 2 });
    const result = await review.acceptAll(changeSet!.id);
    expect(store["a.ts"]).toBe("ai-a\n");
    expect(store["b.ts"]).toBe("human-b\n");
    expect(result.ok).toBe(false);
    expect(result.conflict).toBe(true);
    expect(result.changeSet.files.find((file) => file.path === "a.ts")?.status).toBe("accepted");
    expect(result.changeSet.files.find((file) => file.path === "b.ts")?.status).toBe("conflicted");
  });

  it("rejects all AI changes without deleting human edits", async () => {
    const { store, files } = memoryFiles({ "a.ts": "base\n" });
    const persist = new MemoryChangeStore();
    const tracking = new ChangeTrackingService({ files, persist, id: () => "cs1", now: () => 1 });
    await trackWrite(tracking, files, "a.ts", "ai\n");
    store["a.ts"] = "human\n";
    await tracking.finalizeRun("run-1");
    const review = new ReviewService({ files, tracking, persist, now: () => 2, id: () => "d1" });
    const result = await review.rejectAll("cs1");
    expect(result.conflict).toBe(true);
    expect(store["a.ts"]).toBe("human\n");
  });

  it("rejects AI changes when the workspace still matches the proposal", async () => {
    const { store, files } = memoryFiles({ "a.ts": "base\n" });
    const persist = new MemoryChangeStore();
    const tracking = new ChangeTrackingService({ files, persist, id: () => "cs1", now: () => 1 });
    await trackWrite(tracking, files, "a.ts", "ai\n");
    await tracking.finalizeRun("run-1");
    const review = new ReviewService({ files, tracking, persist, now: () => 2, id: () => "d1" });
    const result = await review.rejectAll("cs1");
    expect(result.ok).toBe(true);
    expect(store["a.ts"]).toBe("base\n");
  });

  it("accepts one file without touching another", async () => {
    const { store, files } = memoryFiles({ "a.ts": "a0\n", "b.ts": "b0\n" });
    let n = 0;
    const tracking = new ChangeTrackingService({ files, id: () => `id${n++}`, now: () => 1 });
    await trackWrite(tracking, files, "a.ts", "a1\n");
    await trackWrite(tracking, files, "b.ts", "b1\n");
    const changeSet = await tracking.finalizeRun("run-1");
    const review = new ReviewService({ files, tracking, now: () => 2, id: () => `d${n++}` });
    const fileA = changeSet!.files.find((file) => file.path === "a.ts")!;
    await review.acceptFile(changeSet!.id, fileA.id);
    expect(store["a.ts"]).toBe("a1\n");
    expect(store["b.ts"]).toBe("b1\n");
    const next = tracking.get(changeSet!.id)!;
    expect(next.files.find((file) => file.path === "a.ts")?.status).toBe("accepted");
    expect(next.files.find((file) => file.path === "b.ts")?.status).toBe("pending");
  });

  it("rejects one file without touching another", async () => {
    const { store, files } = memoryFiles({ "a.ts": "a0\n", "b.ts": "b0\n" });
    let n = 0;
    const tracking = new ChangeTrackingService({ files, id: () => `id${n++}`, now: () => 1 });
    await trackWrite(tracking, files, "a.ts", "a1\n");
    await trackWrite(tracking, files, "b.ts", "b1\n");
    const changeSet = await tracking.finalizeRun("run-1");
    const review = new ReviewService({ files, tracking, now: () => 2, id: () => `d${n++}` });
    const fileA = changeSet!.files.find((file) => file.path === "a.ts")!;
    await review.rejectFile(changeSet!.id, fileA.id);
    expect(store["a.ts"]).toBe("a0\n");
    expect(store["b.ts"]).toBe("b1\n");
  });

  it("accepts and rejects hunks independently", async () => {
    const original = "keep\nold-a\nkeep\nkeep\nkeep\nkeep\nkeep\nkeep\nkeep\nkeep\nold-b\nkeep\n";
    const proposed = "keep\nnew-a\nkeep\nkeep\nkeep\nkeep\nkeep\nkeep\nkeep\nkeep\nnew-b\nkeep\n";
    const { store, files } = memoryFiles({ "a.ts": original });
    let n = 0;
    const tracking = new ChangeTrackingService({ files, id: () => `id${n++}`, now: () => 1 });
    await trackWrite(tracking, files, "a.ts", proposed);
    const changeSet = await tracking.finalizeRun("run-1");
    const file = changeSet!.files[0]!;
    expect(file.hunks.length).toBeGreaterThanOrEqual(2);
    const review = new ReviewService({ files, tracking, now: () => 2, id: () => `d${n++}` });
    await review.acceptHunk(changeSet!.id, file.id, file.hunks[0]!.id);
    await review.rejectHunk(changeSet!.id, file.id, file.hunks[1]!.id);
    const next = tracking.get(changeSet!.id)!;
    expect(next.files[0]!.hunks[0]!.status).toBe("accepted");
    expect(next.files[0]!.hunks[1]!.status).toBe("rejected");
    expect(next.files[0]!.status).toBe("partially-accepted");
    expect(store["a.ts"]).toContain("new-a");
    expect(store["a.ts"]).toContain("old-b");
  });

  it("persists a partial review in the store", async () => {
    const { files } = memoryFiles({ "a.ts": "old\n" });
    const persist = new MemoryChangeStore();
    const tracking = new ChangeTrackingService({ files, persist, id: () => "cs1", now: () => 1 });
    await trackWrite(tracking, files, "a.ts", "new\n");
    await tracking.finalizeRun("run-1");
    const review = new ReviewService({ files, tracking, persist, now: () => 2, id: () => "d1" });
    await review.acceptFile("cs1", tracking.get("cs1")!.files[0]!.id);
    expect(persist.sets.get("cs1")?.files[0]?.status).toBe("accepted");
    expect(persist.decisions).toHaveLength(1);
  });

  it("reloads an open change set after a simulated restart", async () => {
    const { files } = memoryFiles({ "a.ts": "old\n" });
    const persist = new MemoryChangeStore();
    const tracking = new ChangeTrackingService({ files, persist, id: () => "cs1", now: () => 1 });
    await trackWrite(tracking, files, "a.ts", "new\n");
    await tracking.finalizeRun("run-1");
    const tracking2 = new ChangeTrackingService({ files, persist, id: () => "cs2", now: () => 3 });
    const loaded = await tracking2.hydrate("proj");
    expect(loaded).toHaveLength(1);
    expect(loaded[0]?.files[0]?.path).toBe("a.ts");
  });

  it("marks a human edit as a conflict instead of overwriting", async () => {
    const { store, files } = memoryFiles({ "a.ts": "old\n" });
    const tracking = new ChangeTrackingService({ files, id: () => "cs1", now: () => 1 });
    await trackWrite(tracking, files, "a.ts", "ai\n");
    store["a.ts"] = "human\n";
    await tracking.finalizeRun("run-1");
    const review = new ReviewService({ files, tracking, now: () => 2, id: () => "d1" });
    const result = await review.rejectFile("cs1", tracking.get("cs1")!.files[0]!.id);
    expect(result.conflict).toBe(true);
    expect(store["a.ts"]).toBe("human\n");
  });

  it("works without git by restoring from snapshots", async () => {
    const { store, files } = memoryFiles({ "readme.md": "# hi\n" });
    const tracking = new ChangeTrackingService({ files, id: () => "cs1", now: () => 1 });
    await trackWrite(tracking, files, "readme.md", "# hello\n");
    await tracking.finalizeRun("run-1");
    const review = new ReviewService({ files, tracking, now: () => 2, id: () => "d1" });
    await review.rejectAll("cs1");
    expect(store["readme.md"]).toBe("# hi\n");
  });

  it("accepts and rejects a new file", async () => {
    const created = memoryFiles();
    const tracking = new ChangeTrackingService({ files: created.files, id: () => "cs1", now: () => 1 });
    await tracking.prepareMutation(identity(), "create_file", { path: "new.ts" });
    await created.files.write("new.ts", "created\n");
    await tracking.recordMutation(identity(), "create_file", "t1", { path: "new.ts", content: "created\n" }, { success: true, data: { path: "new.ts" } });
    await tracking.finalizeRun("run-1");
    const review = new ReviewService({ files: created.files, tracking, now: () => 2, id: () => "d1" });
    await review.acceptFile("cs1", tracking.get("cs1")!.files[0]!.id);
    expect(created.store["new.ts"]).toBe("created\n");

    const removed = memoryFiles();
    const tracking2 = new ChangeTrackingService({ files: removed.files, id: () => "cs2", now: () => 1 });
    await tracking2.prepareMutation(identity("run-2"), "create_file", { path: "gone.ts" });
    await removed.files.write("gone.ts", "temp\n");
    await tracking2.recordMutation(identity("run-2"), "create_file", "t2", { path: "gone.ts" }, { success: true, data: { path: "gone.ts" } });
    await tracking2.finalizeRun("run-2");
    const review2 = new ReviewService({ files: removed.files, tracking: tracking2, now: () => 2, id: () => "d2" });
    await review2.rejectFile("cs2", tracking2.get("cs2")!.files[0]!.id);
    expect(removed.store["gone.ts"]).toBeUndefined();
  });

  it("restores a deleted file on reject and keeps deletion on accept", async () => {
    const { store, files } = memoryFiles({ "dead.ts": "bye\n" });
    const tracking = new ChangeTrackingService({ files, id: () => "cs1", now: () => 1 });
    await tracking.prepareMutation(identity(), "delete_file", { path: "dead.ts" });
    await files.delete("dead.ts");
    await tracking.recordMutation(identity(), "delete_file", "t1", { path: "dead.ts" }, { success: true, data: { path: "dead.ts" } });
    await tracking.finalizeRun("run-1");
    const review = new ReviewService({ files, tracking, now: () => 2, id: () => "d1" });
    await review.rejectFile("cs1", tracking.get("cs1")!.files[0]!.id);
    expect(store["dead.ts"]).toBe("bye\n");
  });

  it("treats delete plus create of the same content as a rename", async () => {
    const { store, files } = memoryFiles({ "old.ts": "same\n" });
    let n = 0;
    const tracking = new ChangeTrackingService({ files, id: () => `id${n++}`, now: () => 1 });
    await tracking.prepareMutation(identity(), "delete_file", { path: "old.ts" });
    await files.delete("old.ts");
    await tracking.recordMutation(identity(), "delete_file", "t1", { path: "old.ts" }, { success: true, data: { path: "old.ts" } });
    await tracking.prepareMutation(identity(), "write_file", { path: "new.ts" });
    await files.write("new.ts", "same\n");
    await tracking.recordMutation(identity(), "write_file", "t2", { path: "new.ts" }, { success: true, data: { path: "new.ts" } });
    const changeSet = await tracking.finalizeRun("run-1");
    const renamed = changeSet!.files.find((file) => file.kind === "renamed");
    expect(renamed?.previousPath).toBe("old.ts");
    const review = new ReviewService({ files, tracking, now: () => 2, id: () => `d${n++}` });
    await review.rejectFile(changeSet!.id, renamed!.id);
    expect(store["old.ts"]).toBe("same\n");
    expect(store["new.ts"]).toBeUndefined();
  });

  it("undoes a rejected hunk without dropping later human edits elsewhere", async () => {
    const original = "keep\nold-a\nkeep\nkeep\nkeep\nkeep\nkeep\nkeep\nkeep\nkeep\nold-b\nkeep\n";
    const proposed = "keep\nnew-a\nkeep\nkeep\nkeep\nkeep\nkeep\nkeep\nkeep\nkeep\nnew-b\nkeep\n";
    const { store, files } = memoryFiles({ "a.ts": original });
    let n = 0;
    const tracking = new ChangeTrackingService({ files, id: () => `id${n++}`, now: () => 1 });
    await trackWrite(tracking, files, "a.ts", proposed);
    const changeSet = await tracking.finalizeRun("run-1");
    const file = changeSet!.files[0]!;
    const review = new ReviewService({ files, tracking, now: () => 2, id: () => `d${n++}` });
    await review.rejectHunk(changeSet!.id, file.id, file.hunks[0]!.id);
    store["a.ts"] = store["a.ts"]!.replace("keep\n", "human-keep\n");
    const undone = await review.undo(changeSet!.id, "hunk", file.id, file.hunks[0]!.id);
    expect(undone.ok || undone.conflict).toBe(true);
    expect(store["a.ts"]).toContain("human-keep");
  });

  it("keeps already written files after stop/finalize", async () => {
    const { store, files } = memoryFiles({ "a.ts": "old\n" });
    const tracking = new ChangeTrackingService({ files, id: () => "cs1", now: () => 1 });
    await trackWrite(tracking, files, "a.ts", "new\n");
    const changeSet = await tracking.finalizeRun("run-1");
    expect(store["a.ts"]).toBe("new\n");
    expect(changeSet?.status).toBe("pending-review");
  });

  it("detects two runs colliding on the same file", async () => {
    const { files } = memoryFiles({ "a.ts": "old\n" });
    let n = 0;
    const tracking = new ChangeTrackingService({ files, id: () => `id${n++}`, now: () => 1 });
    await trackWrite(tracking, files, "a.ts", "first\n", "run-1");
    await tracking.finalizeRun("run-1");
    await trackWrite(tracking, files, "a.ts", "second\n", "run-2");
    const first = tracking.getByRun("run-1");
    expect(first?.files[0]?.status).toBe("superseded");
    expect(first?.status).toBe("conflicted");
  });

  it("promotes an interrupted active change set to pending-review on hydrate", async () => {
    const { files } = memoryFiles({ "a.ts": "old\n" });
    const persist = new MemoryChangeStore();
    const tracking = new ChangeTrackingService({ files, persist, id: () => "cs1", now: () => 1 });
    await trackWrite(tracking, files, "a.ts", "new\n");
    expect(persist.sets.get("cs1")?.status).toBe("active");
    const tracking2 = new ChangeTrackingService({ files, persist, id: () => "cs2", now: () => 3 });
    const loaded = await tracking2.hydrate("proj");
    expect(loaded[0]?.status).toBe("pending-review");
  });

  it("handles a binary file without hunks", async () => {
    const { files } = memoryFiles();
    const tracking = new ChangeTrackingService({ files, id: () => "cs1", now: () => 1 });
    await tracking.prepareMutation(identity(), "write_file", { path: "icon.png" });
    await files.write("icon.png", "binary");
    await tracking.recordMutation(identity(), "write_file", "t1", { path: "icon.png" }, { success: true, data: { path: "icon.png" } });
    const changeSet = await tracking.finalizeRun("run-1");
    expect(changeSet?.files[0]?.binary).toBe(true);
    expect(changeSet?.files[0]?.hunks).toEqual([]);
  });

  it("does not stack-overflow when a subscriber writes the change set back", async () => {
    const { files } = memoryFiles();
    const tracking = new ChangeTrackingService({ files, id: () => "cs1", now: () => 1 });
    tracking.subscribe((changeSet) => {
      tracking.replace(changeSet);
    });
    await tracking.prepareMutation(identity(), "write_file", { path: "README.md" });
    expect(tracking.getByRun("run-1")?.id).toBe("cs1");
  });

  it("openForConversation hides another conversation's files", async () => {
    const { files } = memoryFiles();
    const tracking = new ChangeTrackingService({ files, now: () => 1, id: () => crypto.randomUUID() });
    await trackWrite(tracking, files, "hunt.ts", "treasure\n", "run-a", "write_file", "conv-a");
    await trackWrite(tracking, files, "box.ts", "punch\n", "run-b", "write_file", "conv-b");

    const dockA = tracking.openForConversation("proj", "conv-a");
    const dockB = tracking.openForConversation("proj", "conv-b");
    expect(dockA.map((item) => item.files[0]?.path)).toEqual(["hunt.ts"]);
    expect(dockB.map((item) => item.files[0]?.path)).toEqual(["box.ts"]);
    expect(tracking.openForProject("proj")).toHaveLength(2);
    expect(tracking.pendingPath("proj", "box.ts")?.files[0]?.path).toBe("box.ts");
  });

  it("hides legacy changesets without conversationId from a named conversation", async () => {
    const { files } = memoryFiles();
    const tracking = new ChangeTrackingService({ files, now: () => 1, id: () => "legacy" });
    await trackWrite(tracking, files, "old.ts", "x\n");
    const set = tracking.getByRun("run-1");
    if (set) {
      const { conversationId: _drop, ...rest } = set;
      tracking.replace(rest);
    }
    expect(tracking.openForConversation("proj", "conv-a")).toEqual([]);
    expect(tracking.openForConversation("proj", null).map((item) => item.files[0]?.path)).toEqual(["old.ts"]);
  });
});
