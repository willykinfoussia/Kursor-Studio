import { describe, expect, it } from "vitest";
import { ChangeTrackingService, MemoryChangeStore } from "../ChangeTrackingService";
import { deserializeAiChangeSet, serializeAiChangeSet } from "../../storage/aiChangeRepository";
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
    isBinary() {
      return false;
    },
  };
  return { store, files };
}

describe("review persistence", () => {
  it("round-trips a change set through the SQLite record shape", async () => {
    const { files } = memoryFiles({ "a.ts": "old\n" });
    const persist = new MemoryChangeStore();
    const tracking = new ChangeTrackingService({ files, persist, id: () => "cs1", now: () => 1 });
    await tracking.prepareMutation({
      accountId: "acc",
      projectId: "proj",
      runId: "run-1",
    }, "write_file", { path: "a.ts" });
    await files.write("a.ts", "new\n");
    await tracking.recordMutation({
      accountId: "acc",
      projectId: "proj",
      runId: "run-1",
    }, "write_file", "t1", { path: "a.ts" }, { success: true, data: { path: "a.ts" } });
    await tracking.finalizeRun("run-1");
    const live = tracking.get("cs1")!;
    const encoded = JSON.parse(JSON.stringify(serializeAiChangeSet(live))) as ReturnType<typeof serializeAiChangeSet>;
    const restored = deserializeAiChangeSet(encoded);
    expect(restored.id).toBe("cs1");
    expect(restored.files[0]?.path).toBe("a.ts");
    expect(restored.files[0]?.hunks.length).toBeGreaterThan(0);
    expect(restored.status).toBe("pending-review");
  });

  it("reloads statuses from the store after a restart", async () => {
    const { files } = memoryFiles({ "a.ts": "old\n" });
    const persist = new MemoryChangeStore();
    const tracking = new ChangeTrackingService({ files, persist, id: () => "cs1", now: () => 1 });
    await tracking.prepareMutation({
      accountId: "acc",
      projectId: "proj",
      runId: "run-1",
    }, "write_file", { path: "a.ts" });
    await files.write("a.ts", "new\n");
    await tracking.recordMutation({
      accountId: "acc",
      projectId: "proj",
      runId: "run-1",
    }, "write_file", "t1", { path: "a.ts" }, { success: true, data: { path: "a.ts" } });
    const tracking2 = new ChangeTrackingService({ files, persist, id: () => "cs2", now: () => 3 });
    const loaded = await tracking2.hydrate("proj");
    expect(loaded[0]?.status).toBe("pending-review");
    expect(loaded[0]?.files[0]?.status).toBe("pending");
  });
});
