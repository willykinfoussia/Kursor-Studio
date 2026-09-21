import { describe, expect, it, vi } from "vitest";
import { createDeleteFileTool } from "../deleteFile";
import { idleToolContext } from "../result";
import { createMockFs } from "./mockFs";

describe("delete_file", () => {
  it("deletes a relative path", async () => {
    const remove = vi.fn(async () => undefined);
    const result = await createDeleteFileTool({ fs: createMockFs({ delete: remove }) }).execute(
      { path: "tmp.txt" },
      idleToolContext(),
    );
    expect(remove).toHaveBeenCalledWith("tmp.txt");
    expect(result.success).toBe(true);
  });

  it("rejects a missing path and traversal", async () => {
    const tool = createDeleteFileTool({ fs: createMockFs() });
    expect((await tool.execute({}, idleToolContext())).error?.code).toBe("invalid_input");
    expect((await tool.execute({ path: "../x" }, idleToolContext())).error?.code).toBe("path_outside_project");
  });
});
