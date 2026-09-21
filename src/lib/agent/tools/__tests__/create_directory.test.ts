import { describe, expect, it, vi } from "vitest";
import { createCreateDirectoryTool } from "../createDirectory";
import { idleToolContext } from "../result";
import { createMockFs } from "./mockFs";

describe("create_directory", () => {
  it("creates a relative directory", async () => {
    const createDirectory = vi.fn(async () => undefined);
    const result = await createCreateDirectoryTool({ fs: createMockFs({ createDirectory }) }).execute(
      { path: "src/lib" },
      idleToolContext(),
    );
    expect(createDirectory).toHaveBeenCalledWith("src/lib");
    expect(result.success).toBe(true);
  });

  it("rejects path traversal", async () => {
    const result = await createCreateDirectoryTool({ fs: createMockFs() }).execute(
      { path: "../outside" },
      idleToolContext(),
    );
    expect(result.error?.code).toBe("path_outside_project");
  });
});
