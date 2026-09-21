import { beforeEach, describe, expect, it, vi } from "vitest";
import { useProjectStore } from "../../../stores/projectStore";
import { createFileSystemService } from "../FileSystemService";

const listDirectory = vi.fn(async (_root: string, path: string) => [{ name: path || "root", path, relativePath: path, kind: "directory" as const }]);

vi.mock("../../tauri/filesystemApi", () => ({
  filesystemApi: {
    listDirectory: (...args: unknown[]) => listDirectory(...args as [string, string]),
    readFile: vi.fn(),
    writeFile: vi.fn(),
    createFile: vi.fn(),
    createDirectory: vi.fn(),
    rename: vi.fn(),
    delete: vi.fn(),
    watch: vi.fn(),
    searchProjectFiles: vi.fn(),
    walkFiles: vi.fn(),
    readBytes: vi.fn(),
  },
}));

describe("filesystem project isolation", () => {
  const files = createFileSystemService(() => useProjectStore.getState().currentProject?.rootPath ?? null);

  beforeEach(() => {
    listDirectory.mockClear();
  });

  it("binds directory listing to the active project root after a switch", async () => {
    useProjectStore.setState({
      currentProject: { id: "proj-a", accountId: "acc", name: "TodoApp", rootPath: "/projects/A", localPath: "/projects/A" },
    });
    await files.listDirectory("");
    expect(listDirectory).toHaveBeenCalledWith("/projects/A", "", false);

    useProjectStore.setState({
      currentProject: { id: "proj-b", accountId: "acc", name: "MyWebsite", rootPath: "/projects/B", localPath: "/projects/B" },
    });
    await files.listDirectory("");
    expect(listDirectory).toHaveBeenCalledWith("/projects/B", "", false);
    expect(listDirectory.mock.calls.at(-1)?.[0]).toBe("/projects/B");
  });
});
