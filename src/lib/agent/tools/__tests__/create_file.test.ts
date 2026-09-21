import { describe, expect, it, vi } from "vitest";
import { createCreateFileTool } from "../createFile";
import { idleToolContext } from "../result";
import { createMockFs } from "./mockFs";

describe("create_file", () => {
  it("creates then writes content", async () => {
    const createFile = vi.fn(async () => undefined);
    const writeFile = vi.fn(async () => undefined);
    const result = await createCreateFileTool({ fs: createMockFs({ createFile, writeFile }) }).execute(
      { path: "src/New.tsx", content: "export {}" },
      idleToolContext(),
    );
    expect(createFile).toHaveBeenCalledWith("src/New.tsx");
    expect(writeFile).toHaveBeenCalledWith("src/New.tsx", "export {}");
    expect(result.success).toBe(true);
  });

  it("rejects an absolute path", async () => {
    const result = await createCreateFileTool({ fs: createMockFs() }).execute(
      { path: "C:/Windows/secret.txt", content: "x" },
      idleToolContext(),
    );
    expect(result.error?.code).toBe("path_outside_project");
  });
});
