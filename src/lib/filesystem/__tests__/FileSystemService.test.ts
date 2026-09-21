import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FileEntry } from "../fileTypes";

const listDirectory = vi.fn();
const readFile = vi.fn();
const writeFile = vi.fn();
const createFile = vi.fn();
const createDirectory = vi.fn();
const rename = vi.fn();
const deleteFile = vi.fn();

vi.mock("../../tauri/filesystemApi", () => ({
  filesystemApi: {
    listDirectory: (...args: unknown[]) => listDirectory(...args),
    readFile: (...args: unknown[]) => readFile(...args),
    writeFile: (...args: unknown[]) => writeFile(...args),
    createFile: (...args: unknown[]) => createFile(...args),
    createDirectory: (...args: unknown[]) => createDirectory(...args),
    rename: (...args: unknown[]) => rename(...args),
    delete: (...args: unknown[]) => deleteFile(...args),
    watch: vi.fn(),
    searchProjectFiles: vi.fn(),
    walkFiles: vi.fn(),
    readBytes: vi.fn(),
  },
}));

vi.mock("../../../stores/settingsStore", () => ({
  useSettingsStore: {
    getState: () => ({ showExcludedDirectories: false }),
  },
}));

import { createFileSystemService } from "../FileSystemService";

const files: FileEntry[] = [
  { name: "App.tsx", path: "src/App.tsx", relativePath: "src/App.tsx", kind: "file" },
  { name: "TodoList.tsx", path: "src/TodoList.tsx", relativePath: "src/TodoList.tsx", kind: "file" },
  { name: "src", path: "src", relativePath: "src", kind: "directory" },
];

const root = "C:/Projects/TodoApp";

describe("FileSystemService.searchFiles", () => {
  const service = createFileSystemService(() => root);

  it("filters known files by name and relative path", () => {
    expect(service.searchFiles("App", files).map((entry) => entry.relativePath)).toEqual(["src/App.tsx"]);
    expect(service.searchFiles("src/", files).map((entry) => entry.name)).toEqual(["App.tsx", "TodoList.tsx"]);
  });
});

describe("FileSystemService CRUD", () => {
  const service = createFileSystemService(() => root);

  beforeEach(() => {
    listDirectory.mockReset();
    readFile.mockReset();
    writeFile.mockReset();
    createFile.mockReset();
    createDirectory.mockReset();
    rename.mockReset();
    deleteFile.mockReset();
  });

  it("lists, reads, writes, creates, renames and deletes through the filesystem API", async () => {
    listDirectory.mockResolvedValue(files);
    readFile.mockResolvedValue("export default function App() {}");
    writeFile.mockResolvedValue(undefined);
    createFile.mockResolvedValue(undefined);
    createDirectory.mockResolvedValue(undefined);
    rename.mockResolvedValue(undefined);
    deleteFile.mockResolvedValue(undefined);

    await expect(service.listDirectory("src")).resolves.toEqual(files);
    expect(listDirectory).toHaveBeenCalledWith(root, "src", false);

    await expect(service.readFile("src/App.tsx")).resolves.toContain("function App");
    expect(readFile).toHaveBeenCalledWith(root, "src/App.tsx");

    await service.writeFile("src/App.tsx", "next");
    expect(writeFile).toHaveBeenCalledWith(root, "src/App.tsx", "next");

    await service.writeFile("boiss/client/package.json", "{}");
    expect(createDirectory).toHaveBeenCalledWith(root, "boiss");
    expect(createDirectory).toHaveBeenCalledWith(root, "boiss/client");
    expect(writeFile).toHaveBeenCalledWith(root, "boiss/client/package.json", "{}");

    await service.createFile("src/TodoItem.tsx");
    expect(createFile).toHaveBeenCalledWith(root, "src/TodoItem.tsx");

    await service.createDirectory("src/components");
    expect(createDirectory).toHaveBeenCalledWith(root, "src/components");

    await service.rename("src/App.tsx", "src/Main.tsx");
    expect(rename).toHaveBeenCalledWith(root, "src/App.tsx", "src/Main.tsx");

    await service.delete("src/Main.tsx");
    expect(deleteFile).toHaveBeenCalledWith(root, "src/Main.tsx");
  });

  it("maps create, rename and delete failures to distinct user errors", async () => {
    createFile.mockRejectedValue(new Error("disk full"));
    createDirectory.mockRejectedValue(new Error("disk full"));
    rename.mockRejectedValue(new Error("disk full"));
    deleteFile.mockRejectedValue(new Error("disk full"));

    await expect(service.createFile("src/New.tsx")).rejects.toThrow("Unable to create the file.");
    await expect(service.createDirectory("src/lib")).rejects.toThrow("Unable to create the folder.");
    await expect(service.rename("src/App.tsx", "src/Main.tsx")).rejects.toThrow("Unable to rename.");
    await expect(service.delete("src/App.tsx")).rejects.toThrow("Unable to delete.");
  });
});
