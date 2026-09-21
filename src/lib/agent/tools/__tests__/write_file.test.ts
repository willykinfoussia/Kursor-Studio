import { describe, expect, it, vi } from "vitest";
import { createWriteFileTool } from "../writeFile";
import { idleToolContext } from "../result";
import { createMockFs } from "./mockFs";

describe("write_file", () => {
  it("writes content through the filesystem service", async () => {
    const writeFile = vi.fn(async () => undefined);
    const result = await createWriteFileTool({ fs: createMockFs({ writeFile }) }).execute(
      { path: "README.md", content: "Hello" },
      idleToolContext(),
    );
    expect(writeFile).toHaveBeenCalledWith("README.md", "Hello");
    expect(result).toMatchObject({ success: true, data: { path: "README.md", bytes: 5 } });
  });

  it("accepts nested relative paths", async () => {
    const writeFile = vi.fn(async () => undefined);
    const result = await createWriteFileTool({ fs: createMockFs({ writeFile }) }).execute(
      { path: "boiss/client/package.json", content: "{}" },
      idleToolContext(),
    );
    expect(writeFile).toHaveBeenCalledWith("boiss/client/package.json", "{}");
    expect(result.success).toBe(true);
  });

  it("rejects path traversal", async () => {
    const writeFile = vi.fn(async () => undefined);
    const result = await createWriteFileTool({ fs: createMockFs({ writeFile }) }).execute(
      { path: "../secret.txt", content: "nope" },
      idleToolContext(),
    );
    expect(result.error?.code).toBe("path_outside_project");
    expect(writeFile).not.toHaveBeenCalled();
  });
});
