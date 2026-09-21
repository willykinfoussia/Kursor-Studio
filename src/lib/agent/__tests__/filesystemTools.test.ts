import { beforeEach, describe, expect, it, vi } from "vitest";
import { useProjectStore } from "../../../stores/projectStore";
import { createWriteFileTool } from "../tools/writeFile";
import { idleToolContext } from "../tools/result";
import { createMockFs } from "../tools/__tests__/mockFs";

describe("filesystem agent tools", () => {
  beforeEach(() => {
    useProjectStore.setState({
      currentProject: {
        id: "C:/Projects/TodoApp",
        accountId: "local-account",
        name: "TodoApp",
        rootPath: "C:/Projects/TodoApp",
        localPath: "C:/Projects/TodoApp",
      },
    });
  });

  it("writes a README through write_file", async () => {
    const writeFile = vi.fn(async () => undefined);
    const result = await createWriteFileTool({ fs: createMockFs({ writeFile }) }).execute(
      { path: "README.md", content: "Hello World" },
      idleToolContext(),
    );
    expect(writeFile).toHaveBeenCalledWith("README.md", "Hello World");
    expect(result).toMatchObject({ success: true, data: { path: "README.md", bytes: 11 } });
  });

  it("rejects path traversal", async () => {
    const writeFile = vi.fn(async () => undefined);
    const result = await createWriteFileTool({ fs: createMockFs({ writeFile }) }).execute(
      { path: "../secret.txt", content: "nope" },
      idleToolContext(),
    );
    expect(result.success).toBe(false);
    expect(writeFile).not.toHaveBeenCalled();
  });
});
