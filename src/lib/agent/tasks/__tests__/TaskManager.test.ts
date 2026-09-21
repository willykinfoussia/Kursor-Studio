import { describe, expect, it } from "vitest";
import { TaskManager } from "../TaskManager";

describe("TaskManager", () => {
  it("creates an active run task and completes it", async () => {
    const manager = new TaskManager();
    const task = await manager.create({ title: "Add a filter", projectId: "p1" });
    expect(manager.getActiveId()).toBe(task.id);
    expect(task.status).toBe("running");
    const done = await manager.complete();
    expect(done?.status).toBe("completed");
    expect(done?.progress).toBe(100);
  });

  it("upserts workflow steps without dropping the active run", async () => {
    const manager = new TaskManager();
    const run = await manager.create({ title: "Feature", agentRunId: "run-1" });
    await manager.upsertStep({
      id: "workflow:implement",
      title: "Implement",
      status: "running",
      progress: 40,
      agentRunId: "run-1",
    });
    expect(manager.getActiveId()).toBe(run.id);
    const listed = await manager.list();
    expect(listed.some((item) => item.id === "workflow:implement")).toBe(true);
  });
});
