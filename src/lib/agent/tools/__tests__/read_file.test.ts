import { describe, expect, it, vi } from "vitest";
import { createReadFileTool } from "../readFile";
import { idleToolContext } from "../result";
import { createMockFs } from "./mockFs";

describe("read_file", () => {
  it("reads a truncated slice of a text file", async () => {
    const fs = createMockFs({
      readFile: vi.fn(async () => "abcdef"),
    });
    const result = await createReadFileTool({ fs }).execute({ path: "src/App.tsx", offset: 2, limit: 2 }, idleToolContext());
    expect(result.success).toBe(true);
    expect(result.data).toMatchObject({ path: "src/App.tsx", content: "cd", truncated: true });
  });

  it("rejects invalid input and path traversal", async () => {
    const tool = createReadFileTool({ fs: createMockFs() });
    expect((await tool.execute({ path: "" }, idleToolContext())).error?.code).toBe("invalid_input");
    expect((await tool.execute({ path: "/etc/passwd" }, idleToolContext())).error?.code).toBe("path_outside_project");
  });
});
